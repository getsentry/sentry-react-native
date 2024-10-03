/* eslint-disable complexity */
import type { BrowserOptions } from '@sentry/react';
import type { Integration } from '@sentry/types';

import type { ReactNativeClientOptions } from '../options';
import { ReactNativeTracing } from '../tracing';
import { isExpoGo, notWeb } from '../utils/environment';
import {
  breadcrumbsIntegration,
  browserApiErrorsIntegration,
  browserGlobalHandlersIntegration,
  browserLinkedErrorsIntegration,
  browserReplayIntegration,
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
  mobileReplayIntegration,
  modulesLoaderIntegration,
  nativeLinkedErrorsIntegration,
  nativeReleaseIntegration,
  reactNativeErrorHandlersIntegration,
  reactNativeInfoIntegration,
  screenshotIntegration,
  sdkInfoIntegration,
  spotlightIntegration,
  viewHierarchyIntegration,
} from './exports';
import { createReactNativeRewriteFrames } from './rewriteframes';

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

  if (__DEV__ && notWeb()) {
    integrations.push(debugSymbolicatorIntegration());
  }

  integrations.push(createReactNativeRewriteFrames());

  if (options.enableNative) {
    integrations.push(deviceContextIntegration());
    integrations.push(modulesLoaderIntegration());
    if (options.attachScreenshot) {
      integrations.push(screenshotIntegration());
    }
    if (options.attachViewHierarchy) {
      integrations.push(viewHierarchyIntegration());
    }
    if (
      options.profilesSampleRate ??
      (options._experiments && typeof options._experiments.profilesSampleRate === 'number')
    ) {
      integrations.push(hermesProfilingIntegration());
    }
  }

  // hasTracingEnabled from `@sentry/core` only check if tracesSampler or tracesSampleRate keys are present
  // that's different from prev imp here and might lead misconfiguration
  // `tracesSampleRate: undefined` should not enable tracing
  const hasTracingEnabled =
    options.enableTracing ||
    typeof options.tracesSampleRate === 'number' ||
    typeof options.tracesSampler === 'function';
  if (hasTracingEnabled && options.enableAutoPerformanceTracing) {
    integrations.push(new ReactNativeTracing());
  }
  if (options.enableCaptureFailedRequests) {
    integrations.push(httpClientIntegration());
  }

  if (isExpoGo()) {
    integrations.push(expoContextIntegration());
  }

  if (options.spotlight || options.enableSpotlight) {
    const sidecarUrl = (typeof options.spotlight === 'string' && options.spotlight) || options.spotlightSidecarUrl;
    integrations.push(spotlightIntegration({ sidecarUrl }));
  }

  if (
    (options._experiments && typeof options._experiments.replaysOnErrorSampleRate === 'number') ||
    (options._experiments && typeof options._experiments.replaysSessionSampleRate === 'number')
  ) {
    integrations.push(notWeb() ? mobileReplayIntegration() : browserReplayIntegration());
    if (!notWeb()) {
      (options as BrowserOptions).replaysOnErrorSampleRate = options._experiments.replaysOnErrorSampleRate;
      (options as BrowserOptions).replaysSessionSampleRate = options._experiments.replaysSessionSampleRate;
    }
  }

  return integrations;
}
