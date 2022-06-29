import { getIntegrationsToSetup, initAndBind, setExtra } from '@sentry/core';
import { Hub, makeMain } from '@sentry/hub';
import { RewriteFrames } from '@sentry/integrations';
import { defaultIntegrations, defaultStackParser, getCurrentHub } from '@sentry/react';
import { Integration, StackFrame } from '@sentry/types';
import { getGlobalObject, logger, stackParserFromStackParserOptions } from '@sentry/utils';
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
import { makeReactNativeTransport } from './transports/native';

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
  patchGlobalPromise: true
};

/**
 * Inits the SDK and returns the final options.
 */
export function init(passedOptions: ReactNativeOptions): void {
  const reactNativeHub = new Hub(undefined, new ReactNativeScope());
  makeMain(reactNativeHub);

  const options: ReactNativeClientOptions = {
    ...DEFAULT_OPTIONS,
    ...passedOptions,
    transport: passedOptions.transport || makeReactNativeTransport,
    integrations: getIntegrationsToSetup(passedOptions),
    stackParser: stackParserFromStackParserOptions(passedOptions.stackParser || defaultStackParser)
  };

  function addIntegration(integration: Integration): void {
    if (options.integrations.filter((i) => i.name == integration.name).length === 0) {
      options.integrations.push(integration);
    }
  }

  // As long as tracing is opt in with either one of these options, then this is how we determine tracing is enabled.
  const tracingEnabled =
    typeof options.tracesSampler !== 'undefined' ||
    typeof options.tracesSampleRate !== 'undefined';

  if (passedOptions.defaultIntegrations === undefined) {
    addIntegration(new ReactNativeErrorHandlers({
      patchGlobalPromise: options.patchGlobalPromise,
    }));
    addIntegration(new Release());
    options.integrations.push(...[
      ...defaultIntegrations.filter(
        (i) => !IGNORED_DEFAULT_INTEGRATIONS.includes(i.name)
      ),
    ]);

    addIntegration(new EventOrigin());
    addIntegration(new SdkInfo());

    if (__DEV__) {
      addIntegration(new DebugSymbolicator());
    }

    addIntegration(new RewriteFrames({
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
      addIntegration(new DeviceContext());
    }
    if (tracingEnabled) {
      if (options.enableAutoPerformanceTracking) {
        addIntegration(new ReactNativeTracing());
      }
    }
  }

  initAndBind(ReactNativeClient, options);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-explicit-any
  if (getGlobalObject<any>().HermesInternal) {
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
