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
 * Story #28: "p95 < 300 ms measured and documented" on history and stats.
 *
 * <p>The dataset is inserted in SQL rather than through the API: 600 sessions created at
 * the pace of start/upload/stop would take several minutes just to measure a read. Two
 * neighbouring accounts hold as many sessions; without them the table would consist
 * entirely of a single user's rows and the {@code (user_id, started_at DESC)} index would
 * have nothing to filter, which would make the measurement optimistic.
 *
 * <p>The budget is measured on the HTTP client side, with a warm JVM: it's the latency the
 * app observes, not the SQL time alone.
 */
@QuarkusTest
class StatsPerformanceTest {

    /** Target volume: "several hundred sessions" (DoD #28). */
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
                measure(token, "GET /activities (sport filter)",
                        "/api/v1/activities?page=0&size=20&sport=running"),
                measure(token, "GET /stats/summary (month)",
                        "/api/v1/stats/summary?period=month&tz=Europe/Paris"),
                measure(token, "GET /stats/summary (year)",
                        "/api/v1/stats/summary?period=year&tz=Europe/Paris"),
                measure(token, "GET /stats/timeline (year)",
                        "/api/v1/stats/timeline?period=year&tz=Europe/Paris"));

        System.out.println();
        System.out.printf("=== #28: p95 over %d sessions/account, %d accounts ===%n",
                SESSIONS_PER_USER, NEIGHBOURS + 1);
        System.out.printf("%-34s %8s %8s %8s%n", "endpoint", "median", "p95", "max");
        for (Measure m : measures) {
            System.out.printf("%-34s %6d ms %6d ms %6d ms%n",
                    m.label(), m.median(), m.p95(), m.max());
        }
        System.out.printf("budget: %d ms · %d samples after %d warm-up rounds%n%n",
                BUDGET_MS, SAMPLES, WARMUP);

        List<String> over = measures.stream()
                .filter(m -> m.p95() >= BUDGET_MS)
                .map(m -> m.label() + " → " + m.p95() + " ms")
                .toList();
        Assertions.assertTrue(over.isEmpty(), "p95 over budget: " + over);
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
        // Index of the 95th percentile, bounded: with 40 samples it's the 38th.
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
     * Sessions spread over ~10 months, two sports, realistic metrics.
     * A single INSERT: 600 JDBC round trips would cost more than the measurement.
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
