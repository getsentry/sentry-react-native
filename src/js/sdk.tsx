/* eslint-disable complexity */
import { getClient, getIntegrationsToSetup, initAndBind, withScope as coreWithScope } from '@sentry/core';
import {
  defaultStackParser,
  makeFetchTransport,
} from '@sentry/react';
import type { Integration, Scope,UserFeedback  } from '@sentry/types';
import { logger, stackParserFromStackParserOptions } from '@sentry/utils';
import * as React from 'react';

import { ReactNativeClient } from './client';
import { getDefaultIntegrations } from './integrations/default';
import type { ReactNativeClientOptions, ReactNativeOptions, ReactNativeWrapperOptions } from './options';
import { shouldEnableNativeNagger } from './options';
import { TouchEventBoundary } from './touchevents';
import type { ReactNativeTracing } from './tracing';
import { ReactNativeProfiler } from './tracing';
import { useEncodePolyfill } from './transports/encodePolyfill';
import { DEFAULT_BUFFER_SIZE, makeNativeTransportFactory } from './transports/native';
import { getDefaultEnvironment, isExpoGo } from './utils/environment';
import { safeFactory, safeTracesSampler } from './utils/safe';
import { NATIVE } from './wrapper';

const DEFAULT_OPTIONS: ReactNativeOptions = {
  enableNativeCrashHandling: true,
  enableNativeNagger: true,
  autoInitializeNativeSdk: true,
  enableAutoPerformanceTracing: true,
  enableWatchdogTerminationTracking: true,
  patchGlobalPromise: true,
  sendClientReports: true,
  maxQueueSize: DEFAULT_BUFFER_SIZE,
  attachStacktrace: true,
  enableCaptureFailedRequests: false,
  enableNdk: true,
};

/**
 * Inits the SDK and returns the final options.
 */
export function init(passedOptions: ReactNativeOptions): void {
  useEncodePolyfill();

  const maxQueueSize = passedOptions.maxQueueSize
    // eslint-disable-next-line deprecation/deprecation
    ?? passedOptions.transportOptions?.bufferSize
    ?? DEFAULT_OPTIONS.maxQueueSize;

  const enableNative = passedOptions.enableNative === undefined || passedOptions.enableNative
    ? NATIVE.isNativeAvailable()
    : false;
  const options: ReactNativeClientOptions = {
    ...DEFAULT_OPTIONS,
    ...passedOptions,
    enableNative,
    enableNativeNagger: shouldEnableNativeNagger(passedOptions.enableNativeNagger),
    // If custom transport factory fails the SDK won't initialize
    transport: passedOptions.transport
      || makeNativeTransportFactory({
        enableNative,
      })
      || makeFetchTransport,
    transportOptions: {
      ...DEFAULT_OPTIONS.transportOptions,
      ...(passedOptions.transportOptions ?? {}),
      bufferSize: maxQueueSize,
    },
    maxQueueSize,
    integrations: [],
    stackParser: stackParserFromStackParserOptions(passedOptions.stackParser || defaultStackParser),
    beforeBreadcrumb: safeFactory(passedOptions.beforeBreadcrumb, { loggerMessage: 'The beforeBreadcrumb threw an error' }),
    initialScope: safeFactory(passedOptions.initialScope, { loggerMessage: 'The initialScope threw an error' }),
  };
  if ('tracesSampler' in options) {
    options.tracesSampler = safeTracesSampler(options.tracesSampler);
  }

  if (!('environment' in options)) {
    options.environment = getDefaultEnvironment();
  }

  const defaultIntegrations: false | Integration[] = passedOptions.defaultIntegrations === undefined
    ? getDefaultIntegrations(options)
    : passedOptions.defaultIntegrations;

  options.integrations = getIntegrationsToSetup({
    integrations: safeFactory(passedOptions.integrations, { loggerMessage: 'The integrations threw an error' }),
    defaultIntegrations,
  });
  initAndBind(ReactNativeClient, options);

  if (isExpoGo()) {
    logger.info('Offline caching, native errors features are not available in Expo Go.');
    logger.info('Use EAS Build / Native Release Build to test these features.');
  }
}

/**
 * Inits the Sentry React Native SDK with automatic instrumentation and wrapped features.
 */
export function wrap<P extends Record<string, unknown>>(
  RootComponent: React.ComponentType<P>,
  options?: ReactNativeWrapperOptions
): React.ComponentType<P> {
  const tracingIntegration = getClient()?.getIntegrationByName?.('ReactNativeTracing') as ReactNativeTracing | undefined;
  if (tracingIntegration) {
    tracingIntegration.useAppStartWithProfiler = true;
  }

  const profilerProps = {
    ...(options?.profilerProps ?? {}),
    name: RootComponent.displayName ?? 'Root',
  };

  const RootApp: React.FC<P> = (appProps) => {
    return (
      <TouchEventBoundary {...(options?.touchEventBoundaryProps ?? {})}>
        <ReactNativeProfiler {...profilerProps}>
          <RootComponent {...appProps} />
        </ReactNativeProfiler>
      </TouchEventBoundary>
    );
  };

  return RootApp;
}

/**
 * If native client is available it will trigger a native crash.
 * Use this only for testing purposes.
 */
export function nativeCrash(): void {
  NATIVE.nativeCrash();
}

/**
 * Flushes all pending events in the queue to disk.
 * Use this before applying any realtime updates such as code-push or expo updates.
 */
export async function flush(): Promise<boolean> {
  try {
    const client = getClient();

    if (client) {
      const result = await client.flush();

      return result;
    }
    // eslint-disable-next-line no-empty
  } catch (_) { }

  logger.error('Failed to flush the event queue.');

  return false;
}

/**
 * Closes the SDK, stops sending events.
 */
export async function close(): Promise<void> {
  try {
    const client = getClient();

    if (client) {
      await client.close();
    }
  } catch (e) {
    logger.error('Failed to close the SDK');
  }
}

/**
 * Captures user feedback and sends it to Sentry.
 */
export function captureUserFeedback(feedback: UserFeedback): void {
  getClient<ReactNativeClient>()?.captureUserFeedback(feedback);
}

/**
 * Creates a new scope with and executes the given operation within.
 * The scope is automatically removed once the operation
 * finishes or throws.
 *
 * This is essentially a convenience function for:
 *
 *     pushScope();
 *     callback();
 *     popScope();
 *
 * @param callback that will be enclosed into push/popScope.
 */
export function withScope<T>(callback: (scope: Scope) => T): T | undefined {
  const safeCallback = (scope: Scope): T | undefined => {
    try {
      return callback(scope);
    } catch (e) {
      logger.error('Error while running withScope callback', e);
      return undefined;
    }
  };
  return coreWithScope(safeCallback);
}
