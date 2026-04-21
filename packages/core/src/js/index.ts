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
  consoleSandbox,
  instrumentOpenAiClient,
  instrumentAnthropicAiClient,
  instrumentGoogleGenAIClient,
  createLangChainCallbackHandler,
  instrumentLangGraph,
  instrumentStateGraphCompile,
} from '@sentry/core';

export type {
  OpenAiClient,
  OpenAiOptions,
  InstrumentedMethod,
  AnthropicAiClient,
  AnthropicAiOptions,
  AnthropicAiInstrumentedMethod,
  AnthropicAiResponse,
  GoogleGenAIClient,
  GoogleGenAIChat,
  GoogleGenAIOptions,
  GoogleGenAIIstrumentedMethod,
  LangChainOptions,
  LangChainIntegration,
  LangGraphOptions,
  LangGraphIntegration,
  CompiledGraph,
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

export { init, wrap, nativeCrash, flush, close, withScope, crashedLastRun, appLoaded } from './sdk';
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
  wrapExpoImage,
  wrapExpoAsset,
} from './tracing';

export type { TimeToDisplayProps, ExpoRouter, ExpoImage, ExpoAsset } from './tracing';

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
