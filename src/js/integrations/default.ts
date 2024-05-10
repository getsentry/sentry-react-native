import { httpClientIntegration } from '@sentry/integrations';
import {
  breadcrumbsIntegration,
  browserApiErrorsIntegration,
  dedupeIntegration,
  functionToStringIntegration,
  globalHandlersIntegration as browserGlobalHandlersIntegration,
  httpContextIntegration,
  inboundFiltersIntegration,
  linkedErrorsIntegration as browserLinkedErrorsIntegration,
} from '@sentry/react';
import type { Integration } from '@sentry/types';

import type { ReactNativeClientOptions } from '../options';
import { HermesProfiling } from '../profiling/integration';
import { ReactNativeTracing } from '../tracing';
import { isExpoGo, notWeb } from '../utils/environment';
import { debugSymbolicatorIntegration } from './debugsymbolicator';
import { deviceContextIntegration } from './devicecontext';
import { eventOriginIntegration } from './eventorigin';
import { expoContextIntegration } from './expocontext';
import { modulesLoaderIntegration } from './modulesloader';
import { nativeLinkedErrorsIntegration } from './nativelinkederrors';
import { reactNativeErrorHandlersIntegration } from './reactnativeerrorhandlers';
import { reactNativeInfoIntegration } from './reactnativeinfo';
import { nativeReleaseIntegration } from './release';
import { createReactNativeRewriteFrames } from './rewriteframes';
import { screenshotIntegration } from './screenshot';
import { sdkInfoIntegration } from './sdkinfo';
import { Spotlight } from './spotlight';
import { viewHierarchyIntegration } from './viewhierarchy';

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
    if (options._experiments && typeof options._experiments.profilesSampleRate === 'number') {
      integrations.push(new HermesProfiling());
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

  if (options.enableSpotlight) {
    integrations.push(
      Spotlight({
        sidecarUrl: options.spotlightSidecarUrl,
      }),
    );
  }

  return integrations;
}
