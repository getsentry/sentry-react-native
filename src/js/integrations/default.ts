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
import { EventOrigin } from './eventorigin';
import { ExpoContext } from './expocontext';
import { ModulesLoader } from './modulesloader';
import { nativeLinkedErrorsIntegration } from './nativelinkederrors';
import { reactNativeErrorHandlersIntegration } from './reactnativeerrorhandlers';
import { ReactNativeInfo } from './reactnativeinfo';
import { Release } from './release';
import { createReactNativeRewriteFrames } from './rewriteframes';
import { Screenshot } from './screenshot';
import { SdkInfo } from './sdkinfo';
import { Spotlight } from './spotlight';
import { ViewHierarchy } from './viewhierarchy';

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

  integrations.push(new Release());
  integrations.push(new EventOrigin());
  integrations.push(new SdkInfo());
  integrations.push(new ReactNativeInfo());

  if (__DEV__ && notWeb()) {
    integrations.push(debugSymbolicatorIntegration());
  }

  integrations.push(createReactNativeRewriteFrames());

  if (options.enableNative) {
    integrations.push(deviceContextIntegration());
    integrations.push(new ModulesLoader());
    if (options.attachScreenshot) {
      integrations.push(new Screenshot());
    }
    if (options.attachViewHierarchy) {
      integrations.push(new ViewHierarchy());
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
    integrations.push(new ExpoContext());
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
