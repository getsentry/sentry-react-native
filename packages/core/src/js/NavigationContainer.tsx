import { debug, getClient } from '@sentry/core';
import * as React from 'react';

import { getNavigationContainerComponent } from './reactNavigationImport';
import { getReactNavigationIntegration } from './tracing/reactnavigation';
import { registerFeatureMarker } from './utils/featureMarkers';

export const NAVIGATION_CONTAINER_INTEGRATION_NAME = 'NavigationContainer';

export type FontStyle = {
  fontFamily: string;
  fontWeight: 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';
};

/**
 * Mirrors the `Theme` type from `@react-navigation/native`.
 */
export interface NavigationTheme {
  dark: boolean;
  colors: {
    primary: string;
    background: string;
    card: string;
    text: string;
    border: string;
    notification: string;
  };
  fonts: {
    regular: FontStyle;
    medium: FontStyle;
    bold: FontStyle;
    heavy: FontStyle;
  };
}

/**
 * Props accepted by `Sentry.NavigationContainer`.
 *
 * Mirrors the props of `NavigationContainer` from `@react-navigation/native`
 * so that users get autocomplete without requiring a compile-time dependency
 * on the library.
 */
export interface SentryNavigationContainerProps {
  children: React.ReactNode;
  initialState?: {
    index?: number;
    key?: string;
    routeNames?: string[];
    routes: Array<{
      key?: string;
      name: string;
      params?: object;
      state?: object;
    }>;
    stale?: true;
    type?: string;
  };
  onStateChange?: (state: Readonly<Record<string, unknown>> | undefined) => void;
  onReady?: () => void;
  onUnhandledAction?: (action: Readonly<{ type: string; payload?: object; source?: string; target?: string }>) => void;
  theme?: NavigationTheme;
  direction?: 'ltr' | 'rtl';
  linking?: {
    enabled?: boolean;
    prefixes: string[];
    filter?: (url: string) => boolean;
    config?: {
      path?: string;
      screens: Record<string, unknown>;
      initialRouteName?: string;
    };
    getInitialURL?: () => string | null | undefined | Promise<string | null | undefined>;
    subscribe?: (listener: (url: string) => void) => undefined | void | (() => void);
    getStateFromPath?: (path: string, options?: object) => object | undefined;
    getPathFromState?: (state: object, options?: object) => string;
    getActionFromState?: (state: object, options?: object) => object | undefined;
  };
  fallback?: React.ReactNode;
  documentTitle?: {
    enabled?: boolean;
    formatter?: (
      options: Record<string, unknown> | undefined,
      route: { key: string; name: string; params?: object } | undefined,
    ) => string;
  };
  [key: string]: unknown;
}

let _warnedMissing = false;
let _warnedNoClient = false;
let _warnedNoIntegration = false;

/**
 * Drop-in replacement for `NavigationContainer` from `@react-navigation/native`
 * that automatically wires up Sentry's `reactNavigationIntegration`.
 *
 * Sentry registers the navigation container before the user-provided `onReady`
 * callback fires, so navigation spans are captured from the first route.
 *
 * If `@react-navigation/native` is not installed, children are rendered directly
 * and `onReady` is not called.
 *
 * @example
 * ```jsx
 * <Sentry.NavigationContainer>
 *   <Stack.Navigator>
 *     ...
 *   </Stack.Navigator>
 * </Sentry.NavigationContainer>
 * ```
 */
export const NavigationContainer = React.forwardRef<unknown, SentryNavigationContainerProps>((props, forwardedRef) => {
  const { onReady: userOnReady, ...restProps } = props;
  const RealNavigationContainer = getNavigationContainerComponent();

  const internalRef = React.useRef<unknown>(null);

  const mergedRef = React.useCallback(
    (instance: unknown) => {
      internalRef.current = instance;
      if (typeof forwardedRef === 'function') {
        forwardedRef(instance);
      } else if (forwardedRef != null) {
        (forwardedRef as React.MutableRefObject<unknown>).current = instance;
      }
    },
    [forwardedRef],
  );

  React.useEffect(() => {
    registerFeatureMarker(NAVIGATION_CONTAINER_INTEGRATION_NAME);
  }, []);

  const onReady = React.useCallback(() => {
    try {
      const client = getClient();
      if (!client) {
        if (!_warnedNoClient) {
          _warnedNoClient = true;
          debug.warn(
            '[Sentry] NavigationContainer: Sentry is not initialized. Call Sentry.init() before mounting NavigationContainer.',
          );
        }
      } else {
        const integration = getReactNavigationIntegration(client);
        if (integration) {
          integration.registerNavigationContainer(internalRef);
        } else if (!_warnedNoIntegration) {
          _warnedNoIntegration = true;
          debug.log(
            '[Sentry] NavigationContainer: reactNavigationIntegration is not registered. Navigation spans will not be captured.',
          );
        }
      }
    } catch {
      // SDK failures must never break the host app
    }

    if (typeof userOnReady === 'function') {
      (userOnReady as () => void)();
    }
  }, [userOnReady]);

  if (!RealNavigationContainer) {
    if (!_warnedMissing) {
      _warnedMissing = true;
      debug.warn('[Sentry] NavigationContainer requires @react-navigation/native to be installed.');
    }
    return <>{restProps.children as React.ReactNode}</>;
  }

  return <RealNavigationContainer {...restProps} ref={mergedRef} onReady={onReady} />;
});
