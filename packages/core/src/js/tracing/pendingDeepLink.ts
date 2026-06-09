/**
 * Cross-module hand-off between the {@link deeplinkIntegration} and the
 * {@link reactNavigationIntegration} idle navigation span.
 *
 * When a deep link is received (either via `Linking.getInitialURL()` on cold
 * start or via the `'url'` event on warm open), the integration stores the
 * raw URL together with a receive timestamp here. The navigation integration
 * then attaches it to the next idle navigation span started within
 * `routeChangeTimeoutMs` (default 1000ms), so traces can correlate
 * "deep link → navigation" timing.
 */

export interface PendingDeepLink {
  /** Raw URL as received from React Native's `Linking` API. */
  url: string;
  /** Wall-clock timestamp (ms since epoch) when the URL was received. */
  receivedAtMs: number;
}

let pending: PendingDeepLink | undefined;

/**
 * Stores the most recently received deep link URL together with the current
 * timestamp. Overwrites any previous pending value — only the latest link
 * matters for correlation with the next navigation.
 */
export function setPendingDeepLink(url: string): void {
  pending = { url, receivedAtMs: Date.now() };
}

/**
 * Returns and clears the pending deep link, but only if it was received
 * within `maxAgeMs` of "now". Stale entries are discarded.
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

/** Test helper — clears the pending value without consuming it. */
export function clearPendingDeepLink(): void {
  pending = undefined;
}
