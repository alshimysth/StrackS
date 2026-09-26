package com.stracks.core.common;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;

/**
 * Limiteur de débit en mémoire, à fenêtre glissante (#72).
 *
 * <p>En mémoire parce que la prod tourne sur <b>un seul</b> backend : un compteur partagé
 * (Redis) n'apporterait rien d'autre qu'une dépendance. Le jour où il y aura deux
 * instances, chaque instance appliquera sa propre limite — le seuil effectif doublera,
 * ce qui reste une protection, pas une faille.
 *
 * <p>Fenêtre glissante plutôt que fixe : une fenêtre fixe laisse passer le double du
 * seuil à cheval sur deux fenêtres, précisément ce qu'un script de bourrage exploite.
 */
@ApplicationScoped
public class RateLimiter {

    /** Seuil : {@code limit} requêtes par {@code window}. */
    public record Limit(int limit, Duration window) {

        /** Format de configuration : {@code 10/PT15M}. */
        public static Limit parse(String spec) {
            String[] parts = spec.split("/", 2);
            if (parts.length != 2) {
                throw new IllegalArgumentException("Seuil invalide (attendu n/PT…) : " + spec);
            }
            return new Limit(Integer.parseInt(parts[0].trim()), Duration.parse(parts[1].trim()));
        }
    }

    private final Map<String, Deque<Instant>> hits = new ConcurrentHashMap<>();

    /**
     * Compte une requête pour {@code key}, ou la refuse.
     *
     * @throws TooManyRequestsException si le seuil est atteint ; la requête refusée
     *         n'est pas comptée, sinon un client qui insiste ne sortirait jamais du blocage.
     */
    public void acquire(String key, Limit limit) {
        acquire(key, limit, Instant.now());
    }

    void acquire(String key, Limit limit, Instant now) {
        Deque<Instant> log = hits.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (log) {
            Instant horizon = now.minus(limit.window());
            while (!log.isEmpty() && !log.peekFirst().isAfter(horizon)) {
                log.pollFirst();
            }
            if (log.size() >= limit.limit()) {
                Instant freedAt = log.peekFirst().plus(limit.window());
                long seconds = Math.max(1, Duration.between(now, freedAt).toSeconds() + 1);
                throw new TooManyRequestsException(seconds);
            }
            log.addLast(now);
        }
    }

    /**
     * Ménage : sans lui, chaque IP jamais vue garderait une entrée pour toujours. Une clé
     * dont le dernier passage est plus vieux que la plus longue fenêtre configurée (1 h)
     * ne peut plus rien bloquer.
     */
    @Scheduled(every = "10m", identity = "rate-limiter-cleanup")
    void evictIdle() {
        Instant horizon = Instant.now().minus(Duration.ofHours(2));
        hits.entrySet().removeIf(entry -> {
            Deque<Instant> log = entry.getValue();
            synchronized (log) {
                return log.isEmpty() || !log.peekLast().isAfter(horizon);
            }
        });
    }

    /** Pour les tests : repart d'un état vierge. */
    public void reset() {
        hits.clear();
    }
}
