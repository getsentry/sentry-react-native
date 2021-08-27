export {
  Breadcrumb,
  Request,
  SdkInfo,
  Event,
  Exception,
  Response,
  Severity,
  StackFrame,
  Stacktrace,
  Status,
  Thread,
  User,
} from "@sentry/types";

import { addGlobalEventProcessor } from "@sentry/core";
export {
  addGlobalEventProcessor,
  addBreadcrumb,
  captureException,
  captureEvent,
  captureMessage,
  configureScope,
  getHubFromCarrier,
  getCurrentHub,
  Hub,
  Scope,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  startTransaction,
  withScope,
} from "@sentry/core";

// We need to import it so we patch the hub with global functions
// aka. this has side effects
import "@sentry/tracing";

// Add the React Native SDK's own tracing extensions, this needs to happen AFTER @sentry/tracing's
import { _addTracingExtensions } from "./measurements";
_addTracingExtensions();

export {
  Integrations as BrowserIntegrations,
  ErrorBoundary,
  withErrorBoundary,
  createReduxEnhancer,
  Profiler,
  useProfiler,
  withProfiler,
} from "@sentry/react";

import * as Integrations from "./integrations";
import { SDK_NAME, SDK_VERSION } from "./version";

export { ReactNativeBackend } from "./backend";
export { ReactNativeOptions } from "./options";
export { ReactNativeClient } from "./client";

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
} from "./sdk";
export { TouchEventBoundary, withTouchEventBoundary } from "./touchevents";

export {
  ReactNativeTracing,
  ReactNavigationV4Instrumentation,
  ReactNavigationV5Instrumentation,
  RoutingInstrumentation,
  ReactNavigationTransactionContext,
} from "./tracing";

/**
 * Adds the sdk info. Make sure this is called after @sentry/react's so this is the top-level SDK.
 */
function createReactNativeEventProcessor(): void {
  if (addGlobalEventProcessor) {
    addGlobalEventProcessor((event) => {
      event.platform = event.platform || "javascript";
      event.sdk = {
        ...event.sdk,
        name: SDK_NAME,
        packages: [
          ...((event.sdk && event.sdk.packages) || []),
          {
            name: "npm:@sentry/react-native",
            version: SDK_VERSION,
          },
        ],
        version: SDK_VERSION,
      };

      return event;
    });
  }
}

createReactNativeEventProcessor();

export { Integrations, SDK_NAME, SDK_VERSION };
