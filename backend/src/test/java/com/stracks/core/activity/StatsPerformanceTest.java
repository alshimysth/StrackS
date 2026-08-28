package com.stracks.core.activity;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.stracks.core.auth.AuthResourceTest;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.response.Response;
import jakarta.inject.Inject;
import jakarta.transaction.UserTransaction;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;

/**
 * Story #28 — « p95 < 300 ms mesuré et documenté » sur l'historique et les stats.
 *
 * <p>Le jeu de données est inséré en SQL et non par l'API : 600 séances créées au
 * rythme de start/upload/stop prendraient plusieurs minutes pour mesurer une lecture.
 * Deux comptes voisins portent autant de séances — sans eux la table tiendrait
 * entièrement dans le jeu d'un seul utilisateur et l'index
 * {@code (user_id, started_at DESC)} n'aurait rien à filtrer, ce qui rendrait la
 * mesure optimiste.
 *
 * <p>Le budget est mesuré côté client HTTP, JVM chauffée : c'est la latence que
 * l'application observe, pas le temps SQL seul.
 */
@QuarkusTest
class StatsPerformanceTest {

    /** Volume cible : « plusieurs centaines de séances » (DoD #28). */
    private static final int SESSIONS_PER_USER = 600;
    private static final int NEIGHBOURS = 2;
    private static final int WARMUP = 8;
    private static final int SAMPLES = 40;
    private static final long BUDGET_MS = 300;

    @Inject
    EntityManager em;

    @Inject
    UserTransaction tx;

    @Test
    void p95_stays_under_budget_on_history_and_stats() throws Exception {
        String email = "perf-" + UUID.randomUUID() + "@example.com";
        String token = AuthResourceTest.register(email, "motdepasse8");
        UUID userId = UUID.fromString(userIdOf(email));

        seed(userId, SESSIONS_PER_USER);
        for (int i = 0; i < NEIGHBOURS; i++) {
            String neighbour = "perf-noise-" + UUID.randomUUID() + "@example.com";
            AuthResourceTest.register(neighbour, "motdepasse8");
            seed(UUID.fromString(userIdOf(neighbour)), SESSIONS_PER_USER);
        }

        List<Measure> measures = List.of(
                measure(token, "GET /activities (page 1)", "/api/v1/activities?page=0&size=20"),
                measure(token, "GET /activities (page 10)", "/api/v1/activities?page=10&size=20"),
                measure(token, "GET /activities (filtré sport)",
                        "/api/v1/activities?page=0&size=20&sport=running"),
                measure(token, "GET /stats/summary (mois)",
                        "/api/v1/stats/summary?period=month&tz=Europe/Paris"),
                measure(token, "GET /stats/summary (année)",
                        "/api/v1/stats/summary?period=year&tz=Europe/Paris"),
                measure(token, "GET /stats/timeline (année)",
                        "/api/v1/stats/timeline?period=year&tz=Europe/Paris"));

        System.out.println();
        System.out.printf("=== #28 — p95 sur %d séances/compte, %d comptes ===%n",
                SESSIONS_PER_USER, NEIGHBOURS + 1);
        System.out.printf("%-34s %8s %8s %8s%n", "endpoint", "médiane", "p95", "max");
        for (Measure m : measures) {
            System.out.printf("%-34s %6d ms %6d ms %6d ms%n",
                    m.label(), m.median(), m.p95(), m.max());
        }
        System.out.printf("budget : %d ms · %d mesures après %d tours de chauffe%n%n",
                BUDGET_MS, SAMPLES, WARMUP);

        List<String> over = measures.stream()
                .filter(m -> m.p95() >= BUDGET_MS)
                .map(m -> m.label() + " → " + m.p95() + " ms")
                .toList();
        Assertions.assertTrue(over.isEmpty(), "p95 au-dessus du budget : " + over);
    }

    // ------------------------------------------------------------------

    private record Measure(String label, long median, long p95, long max) {
    }

    private Measure measure(String token, String label, String path) {
        for (int i = 0; i < WARMUP; i++) {
            call(token, path);
        }
        List<Long> samples = new ArrayList<>(SAMPLES);
        for (int i = 0; i < SAMPLES; i++) {
            long start = System.nanoTime();
            call(token, path);
            samples.add((System.nanoTime() - start) / 1_000_000);
        }
        List<Long> sorted = samples.stream().sorted().toList();
        // Index du 95e centile, borné : avec 40 mesures c'est la 38e.
        int p95Index = Math.min(sorted.size() - 1, (int) Math.ceil(sorted.size() * 0.95) - 1);
        return new Measure(label, sorted.get(sorted.size() / 2), sorted.get(p95Index),
                sorted.get(sorted.size() - 1));
    }

    private static void call(String token, String path) {
        Response response = given().header("Authorization", "Bearer " + token).when().get(path);
        Assertions.assertEquals(200, response.statusCode(), path + " → " + response.statusCode());
    }

    private String userIdOf(String email) {
        return em.createNativeQuery("select id from users where email = :mail")
                .setParameter("mail", email).getSingleResult().toString();
    }

    /**
     * Séances étalées sur ~10 mois, deux sports, métriques réalistes.
     * Un seul INSERT : 600 aller-retours JDBC coûteraient plus cher que la mesure.
     */
    private void seed(UUID userId, int count) throws Exception {
        tx.begin();
        em.createNativeQuery("""
                insert into activities (id, user_id, sport_type, status, started_at, ended_at,
                                        duration_s, distance_m, calories, metrics)
                select gen_random_uuid(),
                       :userId,
                       case when g % 3 = 0 then 'walking' else 'running' end,
                       'completed',
                       cast(:anchor as timestamptz) - (g * interval '12 hours'),
                       cast(:anchor as timestamptz) - (g * interval '12 hours') + interval '45 minutes',
                       2700,
                       round((6000 + (g % 47) * 220)::numeric, 1),
                       420,
                       jsonb_build_object('schemaVersion', 1,
                                          'elevationGainM', (g % 130),
                                          'elevationLossM', (g % 120),
                                          'avgPaceSecPerKm', 300 + (g % 90))
                  from generate_series(1, :count) as g
                """)
                .setParameter("userId", userId)
                .setParameter("anchor", Instant.now())
                .setParameter("count", count)
                .executeUpdate();
        tx.commit();
    }
}
