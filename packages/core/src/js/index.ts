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
  setAttribute,
  setAttributes,
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
  consoleSandbox,
  addConsoleInstrumentationFilter,
} from '@sentry/core';

// NOTE: The AI instrumentation helpers (OpenAI, Anthropic, Google GenAI, LangChain,
// LangGraph) and their types were removed from `@sentry/core` in JS v11 and moved to
// the server-only `@sentry/server-utils` package, which React Native does not depend
// on. They are therefore no longer re-exported here.

export {
  ErrorBoundary,
  withErrorBoundary,
  createReduxEnhancer,
  Profiler,
  useProfiler,
  withProfiler,
} from '@sentry/react';

export { logger, consoleLoggingIntegration, type FeatureFlagsIntegration, metrics } from '@sentry/browser';

export * from './integrations/exports';

export { SDK_NAME, SDK_VERSION } from './version';
export type { ReactNativeOptions, NativeLogEntry } from './options';
export { ReactNativeClient } from './client';

export {
  init,
  wrap,
  nativeCrash,
  flush,
  close,
  withScope,
  crashedLastRun,
  appLoaded,
  extendAppStart,
  getExtendedAppStartSpan,
  finishExtendedAppStart,
  pauseAppHangTracking,
  resumeAppHangTracking,
} from './sdk';
export { TouchEventBoundary, withTouchEventBoundary } from './touchevents';
export { NavigationContainer } from './NavigationContainer';
export type { FontStyle, NavigationTheme, SentryNavigationContainerProps } from './NavigationContainer';
export { GlobalErrorBoundary, withGlobalErrorBoundary } from './GlobalErrorBoundary';
export type { GlobalErrorBoundaryProps } from './GlobalErrorBoundary';

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
  reportFullyDisplayed,
  startIdleNavigationSpan,
  startIdleSpan,
  getDefaultIdleNavigationSpanOptions,
  createTimeToFullDisplay,
  createTimeToInitialDisplay,
  wrapExpoRouter,
  expoRouterIntegration,
  wrapExpoRouterErrorBoundary,
  wrapExpoImage,
  wrapExpoAsset,
} from './tracing';

export type { TimeToDisplayProps, ExpoRouter, ExpoRouterErrorBoundaryProps, ExpoImage, ExpoAsset } from './tracing';

export { Mask, Unmask } from './replay/CustomMask';

/** @deprecated The `FeedbackButton` component will be removed in a future major version. */
export { FeedbackButton } from './feedback/FeedbackButton';
export { FeedbackForm } from './feedback/FeedbackForm';
export { showFeedbackForm, enableFeedbackOnShake, disableFeedbackOnShake } from './feedback/FeedbackFormManager';
/** @deprecated `showFeedbackButton` will be removed in a future major version. */
export { showFeedbackButton } from './feedback/FeedbackFormManager';
/** @deprecated `hideFeedbackButton` will be removed in a future major version. */
export { hideFeedbackButton } from './feedback/FeedbackFormManager';

/** @deprecated Use `FeedbackForm` instead. */
export { FeedbackForm as FeedbackWidget } from './feedback/FeedbackForm';
/** @deprecated Use `showFeedbackForm` instead. */
export { showFeedbackForm as showFeedbackWidget } from './feedback/FeedbackFormManager';

export { getDataFromUri } from './wrapper';

export {
  getActiveTurboModuleCall,
  getTurboModuleCallStack,
  popTurboModuleCall,
  pushTurboModuleCall,
  wrapTurboModule,
} from './turbomodule';
export type { TurboModuleArch, TurboModuleCall, TurboModuleCallKind } from './turbomodule';
