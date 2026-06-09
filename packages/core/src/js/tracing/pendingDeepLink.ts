/**
 * Cross-module hand-off between the {@link deeplinkIntegration} and the
 * {@link reactNavigationIntegration} idle navigation span.
 *
 * Two delivery modes are supported, both of which need to work in practice:
 *
 * 1. **Pre-navigation (warm open / normal cold start):** the deep link is
 *    received before any navigation has been dispatched. The URL is stored in
 *    a single slot here; the next idle navigation span consumes it inside
 *    `updateLatestNavigationSpanWithCurrentRoute` (within `routeChangeTimeoutMs`).
 *
 * 2. **Late arrival (Expo Router auto-handled cold start):** Expo Router reads
 *    `Linking.getInitialURL()` independently and may finish the initial
 *    navigation *before* our integration's own `getInitialURL().then(...)`
 *    chain resolves. To still attribute that span, a synchronous listener may
 *    be registered (by the navigation integration) and receives every link as
 *    it arrives. If it tags a still-recording span, it returns `true` and the
 *    slot is left empty — otherwise the link falls through to the slot.
 */

/**
 * How the deep link reached the integration:
 * - `cold-start` — from `Linking.getInitialURL()`. The app may have been
 *   launched by the link; the *initial* navigation is plausibly its target,
 *   so retroactive attribution to an already-mounted initial span is allowed.
 * - `warm-open` — from the `'url'` event while the app was running. The
 *   triggered navigation has not happened yet, so the URL must wait in the
 *   pending slot — retroactively tagging the *previous* navigation would
 *   attribute the link to the wrong span.
 */
export type DeepLinkSource = 'cold-start' | 'warm-open';

export interface PendingDeepLink {
  /** Raw URL as received from React Native's `Linking` API. */
  url: string;
  /** Wall-clock timestamp (ms since epoch) when the URL was received. */
  receivedAtMs: number;
  /** How the link arrived — governs retroactive attribution rules. */
  source: DeepLinkSource;
}

/**
 * Synchronously notified for every deep link as it arrives. A `true` return
 * value indicates the listener has already attributed the link to a live span,
 * and the value should NOT be stored for a future navigation.
 */
export type PendingDeepLinkListener = (link: PendingDeepLink) => boolean;

let pending: PendingDeepLink | undefined;
let listener: PendingDeepLinkListener | undefined;

/**
 * Stores the most recently received deep link URL together with the current
 * timestamp. If a listener is registered and consumes the link synchronously,
 * the slot is left empty.
 *
 * Overwrites any previous unconsumed pending value — only the latest link
 * matters for correlation with the next navigation.
 */
export function setPendingDeepLink(url: string, source: DeepLinkSource): void {
  const value: PendingDeepLink = { url, receivedAtMs: Date.now(), source };
  if (listener?.(value)) {
    return;
  }
  pending = value;
}

/**
 * Returns and clears the pending deep link, but only if it was received
 * within `maxAgeMs` of "now". Stale entries are discarded and the slot is
 * cleared in all cases.
 */
export function consumePendingDeepLink(maxAgeMs: number): PendingDeepLink | undefined {
  const value = pending;
  pending = undefined;
  if (!value) {
    return undefined;
  }
  if (Date.now() - value.receivedAtMs > maxAgeMs) {
    return undefined;
  }
  return value;
}

/**
 * Registers a synchronous listener that is invoked on every {@link setPendingDeepLink}
 * call. Pass `undefined` to unregister. Only a single listener is supported —
 * a new registration replaces the previous one.
 */
export function setPendingDeepLinkListener(fn: PendingDeepLinkListener | undefined): void {
  listener = fn;
}

/** Test helper — clears the pending value and listener without consuming them. */
export function clearPendingDeepLink(): void {
  pending = undefined;
  listener = undefined;
}
