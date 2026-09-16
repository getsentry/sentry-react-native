export { debugSymbolicatorIntegration } from './debugsymbolicator';
export { featureFlagsIntegration } from './featureFlags';
export { deviceContextIntegration } from './devicecontext';
export { reactNativeErrorHandlersIntegration } from './reactnativeerrorhandlers';
export { nativeLinkedErrorsIntegration } from './nativelinkederrors';
export { nativeReleaseIntegration } from './release';
export { eventOriginIntegration } from './eventorigin';
export { debugMetaIntegration } from './debugmeta';
export { sdkInfoIntegration } from './sdkinfo';
export { reactNativeInfoIntegration } from './reactnativeinfo';
export { modulesLoaderIntegration } from './modulesloader';
export { hermesProfilingIntegration } from '../profiling/integration';
export { screenshotIntegration } from './screenshot';
export { viewHierarchyIntegration } from './viewhierarchy';
export { expoContextIntegration } from './expocontext';
export { expoConstantsIntegration } from './expoconstants';
export { expoUpdatesListenerIntegration } from './expoupdateslistener';
export { spotlightIntegration } from './spotlight';
export { mobileReplayIntegration } from '../replay/mobilereplay';
export { feedbackIntegration } from '../feedback/integration';
export { browserReplayIntegration } from '../replay/browserReplay';
export { appStartIntegration } from '../tracing/integrations/appStart';
export { nativeFramesIntegration, createNativeFramesIntegrations } from '../tracing/integrations/nativeFrames';
export { stallTrackingIntegration } from '../tracing/integrations/stalltracking';
export { userInteractionIntegration } from '../tracing/integrations/userInteraction';
export { createReactNativeRewriteFrames } from './rewriteframes';
export { appRegistryIntegration } from './appRegistry';
export { timeToDisplayIntegration } from '../tracing/integrations/timeToDisplayIntegration';
export { breadcrumbsIntegration } from './breadcrumbs';
export { primitiveTagIntegration } from './primitiveTagIntegration';
export { turboModuleContextIntegration } from './turboModuleContext';
export type { TurboModuleContextOptions } from './turboModuleContext';
export { logEnricherIntegration } from './logEnricherIntegration';
export { graphqlIntegration } from './graphql';
export { supabaseIntegration } from './supabase';
export { deeplinkIntegration } from './deeplink';

// User-facing integration option types. Re-exported from the entry point so their
// full shape lands in the API report and field-level changes are surfaced in its diff.
export type { BreadcrumbsOptions } from './breadcrumbs';
export type { LinkedErrorsOptions } from './nativelinkederrors';
export type { ReactNativeErrorHandlersOptions } from './reactnativeerrorhandlers';
export type { SpotlightReactNativeIntegrationOptions } from './spotlight';
export type { GraphQLReactNativeIntegrationOptions } from './graphql';
export type { SupabaseReactNativeIntegrationOptions } from './supabase';
export type { HermesProfilingOptions } from '../profiling/integration';
export type { MobileReplayOptions, ScreenshotStrategy } from '../replay/mobilereplay';
export type { ReplayConfiguration } from '../replay/browserReplay';

export {
  browserApiErrorsIntegration,
  dedupeIntegration,
  functionToStringIntegration,
  globalHandlersIntegration as browserGlobalHandlersIntegration,
  httpClientIntegration,
  httpContextIntegration,
  inboundFiltersIntegration,
  linkedErrorsIntegration as browserLinkedErrorsIntegration,
  rewriteFramesIntegration,
  extraErrorDataIntegration,
} from '@sentry/react';
