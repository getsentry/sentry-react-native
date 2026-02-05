export type {
  Breadcrumb,
  SdkInfo,
  Event,
  Exception,
  SendFeedbackParams,
  SeverityLevel,
  Span,
  StackFrame,
  Stacktrace,
  Thread,
  User,
  UserFeedback,
  ErrorEvent,
  TransactionEvent,
  Metric,
} from '@sentry/core';

export {
  addBreadcrumb,
  addIntegration,
  captureException,
  captureEvent,
  captureFeedback,
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
  lastEventId,
} from '@sentry/core';

export {
  ErrorBoundary,
  withErrorBoundary,
  createReduxEnhancer,
  Profiler,
  useProfiler,
  withProfiler,
} from '@sentry/react';

export {
  logger,
  consoleLoggingIntegration,
  featureFlagsIntegration,
  type FeatureFlagsIntegration,
  metrics,
} from '@sentry/browser';

export * from './integrations/exports';

export { SDK_NAME, SDK_VERSION } from './version';
export type { ReactNativeOptions, NativeLogEntry } from './options';
export { ReactNativeClient } from './client';

export { init, wrap, nativeCrash, flush, close, withScope, crashedLastRun } from './sdk';
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
  createTimeToFullDisplay,
  createTimeToInitialDisplay,
  wrapExpoRouter,
} from './tracing';

export type { TimeToDisplayProps, ExpoRouter } from './tracing';

export { Mask, Unmask } from './replay/CustomMask';

export { FeedbackButton } from './feedback/FeedbackButton';
export { FeedbackWidget } from './feedback/FeedbackWidget';
export { showFeedbackWidget, showFeedbackButton, hideFeedbackButton } from './feedback/FeedbackWidgetManager';

export { getDataFromUri } from './wrapper';
