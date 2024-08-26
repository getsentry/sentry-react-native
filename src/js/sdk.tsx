/* eslint-disable complexity */
import type { Scope } from '@sentry/core';
import { getIntegrationsToSetup, Hub, initAndBind, makeMain, setExtra } from '@sentry/core';
import {
  defaultStackParser,
  getCurrentHub,
  makeFetchTransport,
} from '@sentry/react';
import type { Integration, UserFeedback } from '@sentry/types';
import { logger, stackParserFromStackParserOptions } from '@sentry/utils';
import * as React from 'react';

import { ReactNativeClient } from './client';
import { getDefaultIntegrations } from './integrations/default';
import type { ReactNativeClientOptions, ReactNativeOptions, ReactNativeWrapperOptions } from './options';
import { shouldEnableNativeNagger } from './options';
import { ReactNativeScope } from './scope';
import { TouchEventBoundary } from './touchevents';
import { ReactNativeProfiler, ReactNativeTracing } from './tracing';
import { DEFAULT_BUFFER_SIZE, makeNativeTransportFactory } from './transports/native';
import { makeUtf8TextEncoder } from './transports/TextEncoder';
import { getDefaultEnvironment, isExpoGo, isRunningInMetroDevServer } from './utils/environment';
import { safeFactory, safeTracesSampler } from './utils/safe';
import { NATIVE } from './wrapper';

const DEFAULT_OPTIONS: ReactNativeOptions = {
  enableNativeCrashHandling: true,
  enableNativeNagger: true,
  autoInitializeNativeSdk: true,
  enableAutoPerformanceTracing: true,
  enableWatchdogTerminationTracking: true,
  patchGlobalPromise: true,
  transportOptions: {
    textEncoder: makeUtf8TextEncoder(),
  },
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
  if (isRunningInMetroDevServer()) {
    return;
  }

  const reactNativeHub = new Hub(undefined, new ReactNativeScope());
  makeMain(reactNativeHub);

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
  const tracingIntegration = getCurrentHub().getIntegration(ReactNativeTracing);
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
 * Deprecated. Sets the release on the event.
 * NOTE: Does not set the release on sessions.
 * @deprecated
 */
export function setRelease(release: string): void {
  setExtra('__sentry_release', release);
}

/**
 * Deprecated. Sets the dist on the event.
 * NOTE: Does not set the dist on sessions.
 * @deprecated
 */
export function setDist(dist: string): void {
  setExtra('__sentry_dist', dist);
}

/**
 * If native client is available it will trigger a native crash.
 * Use this only for testing purposes.
 */
export function nativeCrash(): void {
  const client = getCurrentHub().getClient<ReactNativeClient>();
  if (client) {
    client.nativeCrash();
  }
}

/**
 * Flushes all pending events in the queue to disk.
 * Use this before applying any realtime updates such as code-push or expo updates.
 */
export async function flush(): Promise<boolean> {
  try {
    const client = getCurrentHub().getClient<ReactNativeClient>();

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
    const client = getCurrentHub().getClient<ReactNativeClient>();

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
  getCurrentHub().getClient<ReactNativeClient>()?.captureUserFeedback(feedback);
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
  return getCurrentHub().withScope(safeCallback);
}

/**
 * Callback to set context information onto the scope.
 * @param callback Callback function that receives Scope.
 */
export function configureScope(callback: (scope: Scope) => void): ReturnType<Hub['configureScope']> {
  const safeCallback = (scope: Scope): void => {
    try {
      callback(scope);
    } catch (e) {
      logger.error('Error while running configureScope callback', e);
    }
  };
  getCurrentHub().configureScope(safeCallback);
}

/**
 * Returns if the app crashed in the last run.
 */
export async function crashedLastRun(): Promise<boolean | null> {
  return NATIVE.crashedLastRun();
}
