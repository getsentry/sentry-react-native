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
  getRootSpan,
  withActiveSpan,
  suppressTracing,
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

export { init, wrap, nativeCrash, flush, close, captureUserFeedback, withScope, crashedLastRun } from './sdk';
export { TouchEventBoundary, withTouchEventBoundary } from './touchevents';

export {
  reactNativeTracingIntegration,
  getCurrentReactNativeTracingIntegration,
  getReactNativeTracingIntegration,
  reactNavigationIntegration,
  reactNativeNavigationIntegration,
  sentryTraceGesture,
  TimeToInitialDisplay,
  TimeToFullDisplay,
  startTimeToInitialDisplaySpan,
  startTimeToFullDisplaySpan,
  startIdleNavigationSpan,
  startIdleSpan,
  getDefaultIdleNavigationSpanOptions,
} from './tracing';

export type { TimeToDisplayProps } from './tracing';
