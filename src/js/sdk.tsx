import { getIntegrationsToSetup, Hub, initAndBind, makeMain, Scope, setExtra } from '@sentry/core';
import { RewriteFrames } from '@sentry/integrations';
import {
  defaultIntegrations as reactDefaultIntegrations,
  defaultStackParser,
  getCurrentHub,
} from '@sentry/react';
import { Integration, StackFrame, UserFeedback } from '@sentry/types';
import { logger, stackParserFromStackParserOptions } from '@sentry/utils';
import * as React from 'react';

import { ReactNativeClient } from './client';
import {
  DebugSymbolicator,
  DeviceContext,
  EventOrigin,
  ReactNativeErrorHandlers,
  Release,
  SdkInfo,
} from './integrations';
import { ReactNativeClientOptions, ReactNativeOptions, ReactNativeWrapperOptions } from './options';
import { ReactNativeScope } from './scope';
import { TouchEventBoundary } from './touchevents';
import { ReactNativeProfiler, ReactNativeTracing } from './tracing';
import { DEFAULT_BUFFER_SIZE, makeReactNativeTransport } from './transports/native';
import { makeUtf8TextEncoder } from './transports/TextEncoder';
import { safeFactory, safeTracesSampler } from './utils/safe';
import { RN_GLOBAL_OBJ } from './utils/worldwide';

const IGNORED_DEFAULT_INTEGRATIONS = [
  'GlobalHandlers', // We will use the react-native internal handlers
  'TryCatch', // We don't need this
];
const DEFAULT_OPTIONS: ReactNativeOptions = {
  enableNative: true,
  enableNativeCrashHandling: true,
  enableNativeNagger: true,
  autoInitializeNativeSdk: true,
  enableAutoPerformanceTracking: true,
  enableOutOfMemoryTracking: true,
  patchGlobalPromise: true,
  transportOptions: {
    textEncoder: makeUtf8TextEncoder(),
  },
  sendClientReports: true,
  maxQueueSize: DEFAULT_BUFFER_SIZE,
};

/**
 * Inits the SDK and returns the final options.
 */
export function init(passedOptions: ReactNativeOptions): void {
  const reactNativeHub = new Hub(undefined, new ReactNativeScope());
  makeMain(reactNativeHub);

  const maxQueueSize = passedOptions.maxQueueSize
    // eslint-disable-next-line deprecation/deprecation
    ?? passedOptions.transportOptions?.bufferSize
    ?? DEFAULT_OPTIONS.maxQueueSize;
  const options: ReactNativeClientOptions = {
    ...DEFAULT_OPTIONS,
    ...passedOptions,
    // If custom transport factory fails the SDK won't initialize
    transport: passedOptions.transport || makeReactNativeTransport,
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
    tracesSampler: safeTracesSampler(passedOptions.tracesSampler),
  };

  // As long as tracing is opt in with either one of these options, then this is how we determine tracing is enabled.
  const tracingEnabled =
    typeof options.tracesSampler !== 'undefined' ||
    typeof options.tracesSampleRate !== 'undefined';

  const defaultIntegrations: Integration[] = passedOptions.defaultIntegrations || [];
  if (passedOptions.defaultIntegrations === undefined) {
    defaultIntegrations.push(new ReactNativeErrorHandlers({
      patchGlobalPromise: options.patchGlobalPromise,
    }));
    defaultIntegrations.push(new Release());
    defaultIntegrations.push(...[
      ...reactDefaultIntegrations.filter(
        (i) => !IGNORED_DEFAULT_INTEGRATIONS.includes(i.name)
      ),
    ]);

    defaultIntegrations.push(new EventOrigin());
    defaultIntegrations.push(new SdkInfo());

    if (__DEV__) {
      defaultIntegrations.push(new DebugSymbolicator());
    }

    defaultIntegrations.push(new RewriteFrames({
      iteratee: (frame: StackFrame) => {
        if (frame.filename) {
          frame.filename = frame.filename
            .replace(/^file:\/\//, '')
            .replace(/^address at /, '')
            .replace(/^.*\/[^.]+(\.app|CodePush|.*(?=\/))/, '');

          if (
            frame.filename !== '[native code]' &&
            frame.filename !== 'native'
          ) {
            const appPrefix = 'app://';
            // We always want to have a triple slash
            frame.filename =
              frame.filename.indexOf('/') === 0
                ? `${appPrefix}${frame.filename}`
                : `${appPrefix}/${frame.filename}`;
          }
        }
        return frame;
      },
    }));
    if (options.enableNative) {
      defaultIntegrations.push(new DeviceContext());
    }
    if (tracingEnabled) {
      if (options.enableAutoPerformanceTracking) {
        defaultIntegrations.push(new ReactNativeTracing());
      }
    }
  }

  options.integrations = getIntegrationsToSetup({
    integrations: safeFactory(passedOptions.integrations, { loggerMessage: 'The integrations threw an error' }),
    defaultIntegrations,
  });
  initAndBind(ReactNativeClient, options);

  if (RN_GLOBAL_OBJ.HermesInternal) {
    getCurrentHub().setTag('hermes', 'true');
  }
}

/**
 * Inits the Sentry React Native SDK with automatic instrumentation and wrapped features.
 */
export function wrap<P>(
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
export function withScope(callback: (scope: Scope) => void): ReturnType<Hub['withScope']> {
  const safeCallback = (scope: Scope): void => {
    try {
      callback(scope);
    } catch (e) {
      logger.error('Error while running withScope callback', e);
    }
  };
  getCurrentHub().withScope(safeCallback);
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
