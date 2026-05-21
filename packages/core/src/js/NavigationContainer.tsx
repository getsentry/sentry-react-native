import { debug, getClient } from '@sentry/core';
import * as React from 'react';

import { getNavigationContainerComponent } from './reactNavigationImport';
import { getReactNavigationIntegration } from './tracing/reactnavigation';

let _warnedMissing = false;
let _warnedNoIntegration = false;

/**
 * Drop-in replacement for `NavigationContainer` from `@react-navigation/native`
 * that automatically wires up Sentry's `reactNavigationIntegration`.
 *
 * Sentry registers the navigation container before the user-provided `onReady`
 * callback fires, so navigation spans are captured from the first route.
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
export const NavigationContainer = React.forwardRef<unknown, Record<string, unknown>>((props, forwardedRef) => {
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

  const onReady = React.useCallback(() => {
    const client = getClient();
    if (client) {
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
