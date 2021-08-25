import { initAndBind, setExtra } from "@sentry/core";
import { Hub, makeMain } from "@sentry/hub";
import { RewriteFrames } from "@sentry/integrations";
import {
  defaultIntegrations,
  ErrorBoundary,
  getCurrentHub,
} from "@sentry/react";
import { StackFrame } from "@sentry/types";
import { getGlobalObject, logger } from "@sentry/utils";
import * as React from "react";

import { ReactNativeClient } from "./client";
import {
  DebugSymbolicator,
  DeviceContext,
  ReactNativeErrorHandlers,
  Release,
  StallTracking,
} from "./integrations";
import { ReactNativeOptions, ReactNativeWrapperOptions } from "./options";
import { ReactNativeScope } from "./scope";
import { TouchEventBoundary } from "./touchevents";
import { ReactNativeProfiler, ReactNativeTracing } from "./tracing";

const IGNORED_DEFAULT_INTEGRATIONS = [
  "GlobalHandlers", // We will use the react-native internal handlers
  "TryCatch", // We don't need this
];
const DEFAULT_OPTIONS: ReactNativeOptions = {
  enableNative: true,
  enableNativeCrashHandling: true,
  enableNativeNagger: true,
  autoInitializeNativeSdk: true,
  enableStallTracking: true,
  enableAutoPerformanceTracking: true,
};

/**
 * Inits the SDK and returns the final options.
 */
function _init<O = ReactNativeOptions>(passedOptions: O): O {
  const reactNativeHub = new Hub(undefined, new ReactNativeScope());
  makeMain(reactNativeHub);

  const options = {
    ...DEFAULT_OPTIONS,
    ...passedOptions,
  };

  // As long as tracing is opt in with either one of these options, then this is how we determine tracing is enabled.
  const tracingEnabled =
    typeof options.tracesSampler !== "undefined" ||
    typeof options.tracesSampleRate !== "undefined";

  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = [
      new ReactNativeErrorHandlers(),
      new Release(),
      ...defaultIntegrations.filter(
        (i) => !IGNORED_DEFAULT_INTEGRATIONS.includes(i.name)
      ),
    ];
    if (__DEV__) {
      options.defaultIntegrations.push(new DebugSymbolicator());
    }
    options.defaultIntegrations.push(
      new RewriteFrames({
        iteratee: (frame: StackFrame) => {
          if (frame.filename) {
            frame.filename = frame.filename
              .replace(/^file:\/\//, "")
              .replace(/^address at /, "")
              .replace(/^.*\/[^.]+(\.app|CodePush|.*(?=\/))/, "");

            if (
              frame.filename !== "[native code]" &&
              frame.filename !== "native"
            ) {
              const appPrefix = "app://";
              // We always want to have a triple slash
              frame.filename =
                frame.filename.indexOf("/") === 0
                  ? `${appPrefix}${frame.filename}`
                  : `${appPrefix}/${frame.filename}`;
            }
          }
          return frame;
        },
      })
    );
    if (options.enableNative) {
      options.defaultIntegrations.push(new DeviceContext());
    }
    if (tracingEnabled) {
      if (options.enableAutoPerformanceTracking) {
        options.defaultIntegrations.push(new ReactNativeTracing());

        if (options.enableStallTracking) {
          options.defaultIntegrations.push(new StallTracking());
        }
      }
    }
  }

  initAndBind(ReactNativeClient, options);

  // set the event.origin tag.
  getCurrentHub().setTag("event.origin", "javascript");

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-explicit-any
  if (getGlobalObject<any>().HermesInternal) {
    getCurrentHub().setTag("hermes", "true");
  }

  return options;
}

/**
 * Inits the Sentry React Native SDK without any wrapping
 */
export function init(options: ReactNativeOptions): void {
  _init(options);
}

/**
 * Inits the Sentry React Native SDK with automatic instrumentation and wrapped features.
 */
export function initWith(
  RootComponent: React.ComponentType,
  passedOptions: ReactNativeWrapperOptions
): React.FC {
  const options = _init(passedOptions);

  const profilerProps = {
    ...options.profilerProps,
    name: RootComponent.displayName ?? "Root",
  };

  const RootApp: React.FC = (appProps) => {
    return (
      <ErrorBoundary {...options.errorBoundaryProps}>
        <TouchEventBoundary {...options.touchEventBoundaryProps}>
          <ReactNativeProfiler {...profilerProps}>
            <RootComponent {...appProps} />
          </ReactNativeProfiler>
        </TouchEventBoundary>
      </ErrorBoundary>
    );
  };

  return RootApp;
}

/**
 * Deprecated. Sets the release on the event.
 * NOTE: Does not set the release on sessions.
 * @deprecated
 */
export function setRelease(release: string): void {
  setExtra("__sentry_release", release);
}

/**
 * Deprecated. Sets the dist on the event.
 * NOTE: Does not set the dist on sessions.
 * @deprecated
 */
export function setDist(dist: string): void {
  setExtra("__sentry_dist", dist);
}

/**
 * If native client is available it will trigger a native crash.
 * Use this only for testing purposes.
 */
export function nativeCrash(): void {
  const client = getCurrentHub().getClient<ReactNativeClient>();
  if (client) {
    client.nativeCrash();
  }
}

/**
 * Flushes all pending events in the queue to disk.
 * Use this before applying any realtime updates such as code-push or expo updates.
 */
export async function flush(): Promise<boolean> {
  try {
    const client = getCurrentHub().getClient<ReactNativeClient>();

    if (client) {
      const result = await client.flush();

      return result;
    }
    // eslint-disable-next-line no-empty
  } catch (_) {}

  logger.error("Failed to flush the event queue.");

  return false;
}

/**
 * Closes the SDK, stops sending events.
 */
export async function close(): Promise<void> {
  try {
    const client = getCurrentHub().getClient<ReactNativeClient>();

    if (client) {
      await client.close();
    }
  } catch (e) {
    logger.error("Failed to close the SDK");
  }
}
