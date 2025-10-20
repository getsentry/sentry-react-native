/* eslint-disable complexity */
import type { Breadcrumb, BreadcrumbHint, Integration, Scope } from '@sentry/core';
import {
  debug,
  getClient,
  getGlobalScope,
  getIntegrationsToSetup,
  getIsolationScope,
  initAndBind,
  makeDsn,
  stackParserFromStackParserOptions,
  withScope as coreWithScope,
} from '@sentry/core';
import { defaultStackParser, makeFetchTransport, Profiler } from '@sentry/react';
import * as React from 'react';
import { ReactNativeClient } from './client';
import { FeedbackWidgetProvider } from './feedback/FeedbackWidgetProvider';
import { getDevServer } from './integrations/debugsymbolicatorutils';
import { getDefaultIntegrations } from './integrations/default';
import type { ReactNativeClientOptions, ReactNativeOptions, ReactNativeWrapperOptions } from './options';
import { shouldEnableNativeNagger } from './options';
import { enableSyncToNative } from './scopeSync';
import { TouchEventBoundary } from './touchevents';
import { ReactNativeProfiler } from './tracing';
import { useEncodePolyfill } from './transports/encodePolyfill';
import { DEFAULT_BUFFER_SIZE, makeNativeTransportFactory } from './transports/native';
import { getDefaultEnvironment, isExpoGo, isRunningInMetroDevServer, isWeb } from './utils/environment';
import { getDefaultRelease } from './utils/release';
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
  enableAppStartTracking: true,
  enableNativeFramesTracking: true,
  enableStallTracking: true,
  enableUserInteractionTracing: false,
  propagateTraceparent: false,
};

/**
 * Inits the SDK and returns the final options.
 */
export function init(passedOptions: ReactNativeOptions): void {
  if (isRunningInMetroDevServer()) {
    return;
  }

  const maxQueueSize = passedOptions.maxQueueSize
    // eslint-disable-next-line deprecation/deprecation
    ?? passedOptions.transportOptions?.bufferSize
    ?? DEFAULT_OPTIONS.maxQueueSize;

  const enableNative = passedOptions.enableNative === undefined || passedOptions.enableNative
    ? NATIVE.isNativeAvailable()
    : false;

  useEncodePolyfill();
  if (enableNative) {
    enableSyncToNative(getGlobalScope());
    enableSyncToNative(getIsolationScope());
  }

  const getURLFromDSN = (dsn: string | undefined): string | undefined => {
    if (!dsn) {
      return undefined;
    }
    const dsnComponents = makeDsn(dsn);
    if (!dsnComponents) {
      debug.error('Failed to extract url from DSN: ', dsn);
      return undefined;
    }
    const port = dsnComponents.port ? `:${dsnComponents.port}` : '';
    return `${dsnComponents.protocol}://${dsnComponents.host}${port}`;
  };

  const userBeforeBreadcrumb = safeFactory(passedOptions.beforeBreadcrumb, { loggerMessage: 'The beforeBreadcrumb threw an error' });

  // Exclude Dev Server and Sentry Dsn request from Breadcrumbs
  const devServerUrl = getDevServer()?.url;
  const dsn = getURLFromDSN(passedOptions.dsn);
  const defaultBeforeBreadcrumb = (breadcrumb: Breadcrumb, _hint?: BreadcrumbHint): Breadcrumb | null => {
    const type = breadcrumb.type || '';
    const url = typeof breadcrumb.data?.url === 'string' ? breadcrumb.data.url : '';
    if (type === 'http' && ((devServerUrl && url.startsWith(devServerUrl)) || (dsn && url.startsWith(dsn)))) {
      return null;
    }
    return breadcrumb;
  };

  const chainedBeforeBreadcrumb = (breadcrumb: Breadcrumb, hint?: BreadcrumbHint): Breadcrumb | null => {
    let modifiedBreadcrumb = breadcrumb;
    if (userBeforeBreadcrumb) {
      const result = userBeforeBreadcrumb(breadcrumb, hint);
      if (result === null) {
        return null;
      }
      modifiedBreadcrumb = result;
    }
    return defaultBeforeBreadcrumb(modifiedBreadcrumb, hint);
  };

  const options: ReactNativeClientOptions = {
    ...DEFAULT_OPTIONS,
    ...passedOptions,
    release: passedOptions.release ?? getDefaultRelease(),
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
    beforeBreadcrumb: chainedBeforeBreadcrumb,
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
    debug.log('Offline caching, native errors features are not available in Expo Go.');
    debug.log('Use EAS Build / Native Release Build to test these features.');
  }
}

/**
 * Inits the Sentry React Native SDK with automatic instrumentation and wrapped features.
 */
export function wrap<P extends Record<string, unknown>>(
  RootComponent: React.ComponentType<P>,
  options?: ReactNativeWrapperOptions
): React.ComponentType<P> {
  const profilerProps = {
    ...(options?.profilerProps),
    name: RootComponent.displayName ?? 'Root',
    updateProps: {}
  };

  const ProfilerComponent = isWeb() ? Profiler : ReactNativeProfiler;

  const RootApp: React.FC<P> = appProps => {
    return (
      <TouchEventBoundary {...(options?.touchEventBoundaryProps ?? {})}>
        <ProfilerComponent {...profilerProps}>
          <FeedbackWidgetProvider>
            <RootComponent {...appProps} />
          </FeedbackWidgetProvider>
        </ProfilerComponent>
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

  debug.error('Failed to flush the event queue.');

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
    debug.error('Failed to close the SDK');
  }
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
      debug.error('Error while running withScope callback', e);
      return undefined;
    }
  };
  return coreWithScope(safeCallback);
}

/**
 * Returns if the app crashed in the last run.
 */
export async function crashedLastRun(): Promise<boolean | null> {
  return NATIVE.crashedLastRun();
}
