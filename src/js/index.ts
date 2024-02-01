export type {
  Breadcrumb,
  Request,
  SdkInfo,
  Event,
  Exception,
  StackFrame,
  Stacktrace,
  Thread,
  User,
  UserFeedback,
} from '@sentry/types';

export {
  // eslint-disable-next-line deprecation/deprecation
  addGlobalEventProcessor,
  addBreadcrumb,
  captureException,
  captureEvent,
  captureMessage,
  getHubFromCarrier,
  // eslint-disable-next-line deprecation/deprecation
  getCurrentHub,
  Hub,
  Scope,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  // eslint-disable-next-line deprecation/deprecation
  startTransaction,
  startInactiveSpan,
  startSpan,
  startSpanManual,
  getActiveSpan,
} from '@sentry/core';

import { _addTracingExtensions } from './tracing/addTracingExtensions';
_addTracingExtensions();

export {
  // eslint-disable-next-line deprecation/deprecation
  Integrations as BrowserIntegrations,
  ErrorBoundary,
  withErrorBoundary,
  createReduxEnhancer,
  Profiler,
  useProfiler,
  withProfiler,
} from '@sentry/react';

// eslint-disable-next-line deprecation/deprecation
export { lastEventId } from '@sentry/browser';

import * as Integrations from './integrations';
import { SDK_NAME, SDK_VERSION } from './version';
export type { ReactNativeOptions } from './options';
export { ReactNativeClient } from './client';

export {
  init,
  wrap,
  // eslint-disable-next-line deprecation/deprecation
  setDist,
  // eslint-disable-next-line deprecation/deprecation
  setRelease,
  nativeCrash,
  flush,
  close,
  captureUserFeedback,
  withScope,
  configureScope,
} from './sdk';
export { TouchEventBoundary, withTouchEventBoundary } from './touchevents';

export {
  ReactNativeTracing,
  ReactNavigationV4Instrumentation,
  // eslint-disable-next-line deprecation/deprecation
  ReactNavigationV5Instrumentation,
  ReactNavigationInstrumentation,
  ReactNativeNavigationInstrumentation,
  RoutingInstrumentation,
  sentryTraceGesture,
} from './tracing';
export type { ReactNavigationTransactionContext } from './tracing';
export { Integrations, SDK_NAME, SDK_VERSION };
