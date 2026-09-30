/**
 * react-query client for tests (#65).
 *
 * A single place decides the configuration, so that no suite reintroduces the two
 * defects this module fixes.
 *
 * **The teardown leak, measured.** Unmounting a screen removes the observer of every
 * mutation already started, and `Mutation.removeObserver` arms a garbage-collection timer
 * of `gcTime`, 5 minutes by default. But `MutationCache.clear()` (query-core 5.101)
 * removes mutations from the cache **without calling their `destroy()`**: the timer
 * outlives the `afterEach`'s `client.clear()`, and the jest worker can no longer exit.
 * Hence the "worker process has failed to exit gracefully" warning, limited to the suites
 * whose screens start a mutation (activity detail, preferences).
 *
 * **Prefilled caches collected.** Suites set `gcTime: 0` on queries. A `setQueryData`
 * without a screen observing it was then collected on the next tick: depending on
 * scheduling, the screen mounted on an empty cache, started a fetch the test didn't
 * expect, and updated outside `act()`: an intermittent warning, or a test passing without
 * reproducing anything.
 *
 * `gcTime: Infinity` fixes both: react-query arms **no** collection timer
 * (`isValidTimeout(Infinity)` is false), and `client.clear()` empties everything between
 * two tests. It's also closer to the app, whose cache lives 7 days.
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
 * react-query notifications as microtasks, not `setTimeout(0)`.
 *
 * By default, react-query delivers its notifications to components in a timer: they then
 * land outside testing-library's `act()`, and React intermittently reports "An update to
 * … inside a test was not wrapped in act(...)": the screen updates after the test
 * believed the state stable. As a microtask, the notification is flushed inside the
 * asynchronous `act()` that caused it.
 *
 * A deliberate module side effect: every suite building its client here benefits. Measured
 * on the full suite: intermittent warnings on the baseline, none over eight runs after
 * this setting.
 */
notifyManager.setScheduler(queueMicrotask);
