import { hasTracingEnabled } from '@sentry/core';
import { HttpClient } from '@sentry/integrations';
import { Integrations as BrowserReactIntegrations } from '@sentry/react';
import type { Integration } from '@sentry/types';

import type { ReactNativeClientOptions } from '../options';
import { HermesProfiling } from '../profiling/integration';
import { ReactNativeTracing } from '../tracing';
import { notWeb } from '../utils/environment';
import { DebugSymbolicator } from './debugsymbolicator';
import { DeviceContext } from './devicecontext';
import { EventOrigin } from './eventorigin';
import { ModulesLoader } from './modulesloader';
import { NativeLinkedErrors } from './nativelinkederrors';
import { ReactNativeErrorHandlers } from './reactnativeerrorhandlers';
import { ReactNativeInfo } from './reactnativeinfo';
import { Release } from './release';
import { createReactNativeRewriteFrames } from './rewriteframes';
import { Screenshot } from './screenshot';
import { SdkInfo } from './sdkinfo';
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
      new ReactNativeErrorHandlers({
        patchGlobalPromise: options.patchGlobalPromise,
      }),
    );
    integrations.push(new NativeLinkedErrors());
  } else {
    integrations.push(new BrowserReactIntegrations.TryCatch());
    integrations.push(new BrowserReactIntegrations.GlobalHandlers());
    integrations.push(new BrowserReactIntegrations.LinkedErrors());
  }

  // @sentry/react default integrations
  integrations.push(new BrowserReactIntegrations.InboundFilters());
  integrations.push(new BrowserReactIntegrations.FunctionToString());
  integrations.push(new BrowserReactIntegrations.Breadcrumbs());
  integrations.push(new BrowserReactIntegrations.Dedupe());
  integrations.push(new BrowserReactIntegrations.HttpContext());
  // end @sentry/react-native default integrations

  integrations.push(new Release());
  integrations.push(new EventOrigin());
  integrations.push(new SdkInfo());
  integrations.push(new ReactNativeInfo());

  if (__DEV__ && notWeb()) {
    integrations.push(new DebugSymbolicator());
  }

  integrations.push(createReactNativeRewriteFrames());

  if (options.enableNative) {
    integrations.push(new DeviceContext());
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

  if (hasTracingEnabled(options) && options.enableAutoPerformanceTracing) {
    integrations.push(new ReactNativeTracing());
  }
  if (options.enableCaptureFailedRequests) {
    integrations.push(new HttpClient());
  }

  return integrations;
}
