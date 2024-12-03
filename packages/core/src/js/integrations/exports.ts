export { debugSymbolicatorIntegration } from './debugsymbolicator';
export { deviceContextIntegration } from './devicecontext';
export { reactNativeErrorHandlersIntegration } from './reactnativeerrorhandlers';
export { nativeLinkedErrorsIntegration } from './nativelinkederrors';
export { nativeReleaseIntegration } from './release';
export { eventOriginIntegration } from './eventorigin';
export { sdkInfoIntegration } from './sdkinfo';
export { reactNativeInfoIntegration } from './reactnativeinfo';
export { modulesLoaderIntegration } from './modulesloader';
export { hermesProfilingIntegration } from '../profiling/integration';
export { screenshotIntegration } from './screenshot';
export { viewHierarchyIntegration } from './viewhierarchy';
export { expoContextIntegration } from './expocontext';
export { spotlightIntegration } from './spotlight';
export { mobileReplayIntegration } from '../replay/mobilereplay';
export { browserReplayIntegration } from '../replay/browserReplay';
export { appStartIntegration } from '../tracing/integrations/appStart';
export { nativeFramesIntegration, createNativeFramesIntegrations } from '../tracing/integrations/nativeFrames';
export { stallTrackingIntegration } from '../tracing/integrations/stalltracking';
export { userInteractionIntegration } from '../tracing/integrations/userInteraction';
export { createReactNativeRewriteFrames } from './rewriteframes';

export {
  breadcrumbsIntegration,
  browserApiErrorsIntegration,
  dedupeIntegration,
  functionToStringIntegration,
  globalHandlersIntegration as browserGlobalHandlersIntegration,
  httpClientIntegration,
  httpContextIntegration,
  inboundFiltersIntegration,
  linkedErrorsIntegration as browserLinkedErrorsIntegration,
  rewriteFramesIntegration,
} from '@sentry/react';
