export type {
  Breadcrumb,
  Request,
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
} from '@sentry/core';

export {
  addBreadcrumb,
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
  metricsDefault as metrics,
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
  createTimeToFullDisplay,
  createTimeToInitialDisplay,
} from './tracing';

export type { TimeToDisplayProps } from './tracing';

export { Mask, Unmask } from './replay/CustomMask';

export { FeedbackButton } from './feedback/FeedbackButton';
export { FeedbackWidget } from './feedback/FeedbackWidget';
export { showFeedbackWidget, showFeedbackButton, hideFeedbackButton } from './feedback/FeedbackWidgetManager';

export { getDataFromUri } from './wrapper';
