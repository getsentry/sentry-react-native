import type * as React from 'react';

type NavigationContainerComponent = React.ComponentType<Record<string, unknown>>;

let _cached: NavigationContainerComponent | null | undefined;

/**
 * @returns NavigationContainer from @react-navigation/native or null if not installed.
 * The result is cached after the first call.
 */
export function getNavigationContainerComponent(): NavigationContainerComponent | null {
  if (_cached !== undefined) {
    return _cached;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@react-navigation/native') as {
      NavigationContainer?: NavigationContainerComponent;
    };
    _cached = mod?.NavigationContainer ?? null;
  } catch {
    _cached = null;
  }
  return _cached;
}
