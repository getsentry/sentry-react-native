/**
 * Cross-module hand-off between {@link wrapExpoRouter} and the
 * {@link reactNavigationIntegration} idle navigation span.
 *
 * When an Expo Router method (push / replace / navigate / back / dismiss) is
 * called, it stores the initiating method here. The next idle navigation span
 * consumes (and clears) this value so the span can be attributed to the call
 * site via the `navigation.method` attribute.
 */

export interface PendingExpoRouterNavigation {
  /** The Expo Router method that initiated the navigation. */
  method: 'push' | 'replace' | 'navigate' | 'back' | 'dismiss';
}

let pending: PendingExpoRouterNavigation | undefined;

/** Stores the initiating Expo Router navigation call. Overwrites any previous pending value. */
export function setPendingExpoRouterNavigation(value: PendingExpoRouterNavigation): void {
  pending = value;
}

/** Returns and clears the pending Expo Router navigation, if any. */
export function consumePendingExpoRouterNavigation(): PendingExpoRouterNavigation | undefined {
  const value = pending;
  pending = undefined;
  return value;
}

/** Test helper — clears the pending value without consuming it. */
export function clearPendingExpoRouterNavigation(): void {
  pending = undefined;
}
