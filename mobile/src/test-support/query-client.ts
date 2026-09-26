/**
 * Client react-query des tests (#65).
 *
 * Un seul endroit décide de la configuration, pour qu'aucune suite ne réintroduise
 * les deux défauts que ce module corrige.
 *
 * **La fuite de teardown, mesurée.** Démonter un écran retire l'observateur de chaque
 * mutation déjà lancée, et `Mutation.removeObserver` arme un timer de garbage-collection
 * de `gcTime` — 5 minutes par défaut. Or `MutationCache.clear()` (query-core 5.101)
 * retire les mutations du cache **sans appeler leur `destroy()`** : le timer survit au
 * `client.clear()` de l'`afterEach`, et le worker jest ne peut plus rendre la main.
 * D'où l'avertissement « worker process has failed to exit gracefully », limité aux
 * suites dont les écrans lancent une mutation (détail d'activité, préférences).
 *
 * **Les caches préremplis ramassés.** Les suites posaient `gcTime: 0` sur les requêtes.
 * Un `setQueryData` sans écran pour l'observer était alors ramassé au tick suivant :
 * selon l'ordonnancement, l'écran montait sur un cache vide, lançait un fetch que le
 * test n'attendait pas, et se mettait à jour hors `act()` — un avertissement
 * intermittent, ou un test qui passe sans avoir rien reproduit.
 *
 * `gcTime: Infinity` règle les deux : react-query n'arme **aucun** timer de collecte
 * (`isValidTimeout(Infinity)` est faux), et `client.clear()` vide tout entre deux tests.
 * C'est aussi plus proche de l'app, dont le cache vit 7 jours.
 */
import { QueryClient, notifyManager, type DefaultOptions } from '@tanstack/react-query';

export function createTestQueryClient(queries: DefaultOptions['queries'] = {}): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, ...queries },
      mutations: { gcTime: Infinity },
    },
  });
}


/**
 * Notifications react-query en microtâche, pas en `setTimeout(0)`.
 *
 * Par défaut, react-query livre ses notifications aux composants dans un timer : elles
 * atterrissent alors hors de l'`act()` de testing-library, et React signale par
 * intermittence « An update to … inside a test was not wrapped in act(...) » — l'écran
 * se met à jour après que le test a cru l'état stable. En microtâche, la notification
 * est vidée à l'intérieur de l'`act()` asynchrone qui l'a provoquée.
 *
 * Effet de bord de module, voulu : toute suite qui construit son client ici en profite.
 * Mesuré sur la suite complète : avertissements intermittents sur la base, aucun sur
 * huit exécutions après ce réglage.
 */
notifyManager.setScheduler(queueMicrotask);
