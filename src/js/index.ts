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
  addBreadcrumb,
  captureException,
  captureEvent,
  captureMessage,
  Hub,
  Scope,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  startInactiveSpan,
  startSpan,
  startSpanManual,
  getActiveSpan,
  spanToJSON,
  spanIsSampled,
  setMeasurement,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  getClient,
  setCurrentClient,
  addEventProcessor,
  metricsDefault as metrics,
} from '@sentry/core';

import { _addTracingExtensions } from './tracing/addTracingExtensions';
_addTracingExtensions();

export {
  ErrorBoundary,
  withErrorBoundary,
  createReduxEnhancer,
  Profiler,
  useProfiler,
  withProfiler,
} from '@sentry/react';

export * from './integrations/exports';

export { SDK_NAME, SDK_VERSION } from './version';
export type { ReactNativeOptions } from './options';
export { ReactNativeClient } from './client';

export { init, wrap, nativeCrash, flush, close, captureUserFeedback, withScope } from './sdk';
export { TouchEventBoundary, withTouchEventBoundary } from './touchevents';

export {
  ReactNativeTracing,
  ReactNavigationV5Instrumentation,
  ReactNavigationInstrumentation,
  ReactNativeNavigationInstrumentation,
  RoutingInstrumentation,
  sentryTraceGesture,
  TimeToInitialDisplay,
  TimeToFullDisplay,
  startTimeToInitialDisplaySpan,
  startTimeToFullDisplaySpan,
} from './tracing';

export type { TimeToDisplayProps } from './tracing';
