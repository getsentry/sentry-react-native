/* eslint-disable complexity */
import { browserSessionIntegration, consoleLoggingIntegration } from '@sentry/browser';
import type { Integration } from '@sentry/core';
import type { ReactNativeClientOptions } from '../options';
import { reactNativeTracingIntegration } from '../tracing';
import { notWeb } from '../utils/environment';
import {
  appRegistryIntegration,
  appStartIntegration,
  breadcrumbsIntegration,
  browserApiErrorsIntegration,
  browserGlobalHandlersIntegration,
  browserLinkedErrorsIntegration,
  createNativeFramesIntegrations,
  createReactNativeRewriteFrames,
  debugSymbolicatorIntegration,
  dedupeIntegration,
  deviceContextIntegration,
  eventOriginIntegration,
  expoContextIntegration,
  functionToStringIntegration,
  hermesProfilingIntegration,
  httpClientIntegration,
  httpContextIntegration,
  inboundFiltersIntegration,
  logEnricherIntegration,
  mobileReplayIntegration,
  modulesLoaderIntegration,
  nativeLinkedErrorsIntegration,
  nativeReleaseIntegration,
  primitiveTagIntegration,
  reactNativeErrorHandlersIntegration,
  reactNativeInfoIntegration,
  screenshotIntegration,
  sdkInfoIntegration,
  spotlightIntegration,
  stallTrackingIntegration,
  timeToDisplayIntegration,
  userInteractionIntegration,
  viewHierarchyIntegration,
} from './exports';

/**
 * Returns the default ReactNative integrations based on the current environment.
 *
 * Native integrations are only returned when native is enabled.
 *
 * Web integrations are only returned when running on web.
 */
export function getDefaultIntegrations(options: ReactNativeClientOptions): Integration[] {
  const integrations: Integration[] = [];

  if (notWeb()) {
    integrations.push(
      reactNativeErrorHandlersIntegration({
        patchGlobalPromise: options.patchGlobalPromise,
      }),
    );
    integrations.push(nativeLinkedErrorsIntegration());
  } else {
    integrations.push(browserApiErrorsIntegration());
    integrations.push(browserGlobalHandlersIntegration());
    integrations.push(browserLinkedErrorsIntegration());

    if (options.enableAutoSessionTracking) {
      integrations.push(browserSessionIntegration());
    }
  }

  // @sentry/react default integrations
  integrations.push(inboundFiltersIntegration());
  integrations.push(functionToStringIntegration());
  integrations.push(breadcrumbsIntegration());
  integrations.push(dedupeIntegration());
  integrations.push(httpContextIntegration());
  // end @sentry/react-native default integrations

  integrations.push(nativeReleaseIntegration());
  integrations.push(eventOriginIntegration());
  integrations.push(sdkInfoIntegration());
  integrations.push(reactNativeInfoIntegration());

  integrations.push(createReactNativeRewriteFrames());

  if (options.enableNative) {
    integrations.push(deviceContextIntegration());
    integrations.push(modulesLoaderIntegration());
    if (options.enableLogs && options.logsOrigin !== 'native') {
      integrations.push(logEnricherIntegration());
      integrations.push(consoleLoggingIntegration());
    }
    if (options.attachScreenshot) {
      integrations.push(screenshotIntegration());
    }
    if (options.attachViewHierarchy) {
      integrations.push(viewHierarchyIntegration());
    }
    if (typeof options.profilesSampleRate === 'number') {
      integrations.push(hermesProfilingIntegration());
    }
  }

  // hasTracingEnabled from `@sentry/core` only check if tracesSampler or tracesSampleRate keys are present
  // that's different from prev imp here and might lead misconfiguration
  // `tracesSampleRate: undefined` should not enable tracing
  const hasTracingEnabled = typeof options.tracesSampleRate === 'number' || typeof options.tracesSampler === 'function';
  if (hasTracingEnabled && options.enableAppStartTracking && options.enableNative) {
    integrations.push(appStartIntegration());
  }
  const nativeFramesIntegrationInstance = createNativeFramesIntegrations(
    hasTracingEnabled && options.enableNativeFramesTracking && options.enableNative,
  );
  if (nativeFramesIntegrationInstance) {
    integrations.push(nativeFramesIntegrationInstance);
  }
  if (hasTracingEnabled && options.enableStallTracking) {
    integrations.push(stallTrackingIntegration());
  }
  if (hasTracingEnabled && options.enableUserInteractionTracing) {
    integrations.push(userInteractionIntegration());
  }
  if (hasTracingEnabled && options.enableAutoPerformanceTracing) {
    integrations.push(appRegistryIntegration());
    integrations.push(reactNativeTracingIntegration());
  }
  if (hasTracingEnabled) {
    integrations.push(timeToDisplayIntegration());
  }
  if (options.enableCaptureFailedRequests) {
    integrations.push(httpClientIntegration());
  }

  integrations.push(expoContextIntegration());

  if (options.spotlight && __DEV__) {
    const sidecarUrl = typeof options.spotlight === 'string' ? options.spotlight : undefined;
    integrations.push(spotlightIntegration({ sidecarUrl }));
  }

  const hasReplayOptions =
    typeof options.replaysOnErrorSampleRate === 'number' || typeof options.replaysSessionSampleRate === 'number';
  const hasExperimentsReplayOptions =
    (options._experiments && typeof options._experiments.replaysOnErrorSampleRate === 'number') ||
    (options._experiments && typeof options._experiments.replaysSessionSampleRate === 'number');

  if (!hasReplayOptions && hasExperimentsReplayOptions) {
    // Remove in the next major version (v7)
    options.replaysOnErrorSampleRate = options._experiments?.replaysOnErrorSampleRate;
    options.replaysSessionSampleRate = options._experiments?.replaysSessionSampleRate;
  }

  if ((hasReplayOptions || hasExperimentsReplayOptions) && notWeb()) {
    // We can't create and add browserReplayIntegration as it overrides the users supplied one
    // The browser replay integration works differently than the rest of default integrations
    integrations.push(mobileReplayIntegration());
  }

  if (__DEV__ && notWeb()) {
    integrations.push(debugSymbolicatorIntegration());
  }

  integrations.push(primitiveTagIntegration());

  return integrations;
}
