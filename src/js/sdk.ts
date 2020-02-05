import {
  defaultIntegrations,
  getCurrentHub,
  Integrations
} from "@sentry/browser";
import { initAndBind, setExtra } from "@sentry/core";
import { RewriteFrames } from "@sentry/integrations";
import { StackFrame } from "@sentry/types";
import { getGlobalObject } from "@sentry/utils";
// import { NativeModules } from "react-native";

import { ReactNativeOptions } from "./backend";
import { ReactNativeClient } from "./client";
import {
  DebugSymbolicator,
  DeviceContext,
  ReactNativeErrorHandlers,
  Release
} from "./integrations";

// const { RNSentry } = NativeModules;

const IGNORED_DEFAULT_INTEGRATIONS = [
  "GlobalHandlers", // We will use the react-native internal handlers
  "Breadcrumbs", // We add it later, just not patching fetch
  "TryCatch" // We don't need this
];

/**
 * Inits the SDK
 */
export function init(
  options: ReactNativeOptions = {
    enableNative: true,
    enableNativeCrashHandling: true
  }
): void {
  // tslint:disable: strict-comparisons
  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = [
      new ReactNativeErrorHandlers(),
      new Release(),
      ...defaultIntegrations.filter(
        i => !IGNORED_DEFAULT_INTEGRATIONS.includes(i.name)
      ),
      new Integrations.Breadcrumbs({
        console: false, // If this in enabled it causes problems to native calls on >= RN 0.60
        fetch: false
      })
    ];
    if (__DEV__) {
      options.defaultIntegrations.push(new DebugSymbolicator());
    }
    options.defaultIntegrations.push(
      new RewriteFrames({
        iteratee: (frame: StackFrame) => {
          if (frame.filename) {
            frame.filename = frame.filename
              .replace(/^file\:\/\//, "")
              .replace(/^address at /, "")
              .replace(/^.*\/[^\.]+(\.app|CodePush|.*(?=\/))/, "");

            if (frame.filename === "native") {
              frame.in_app = false;
            }

            const appPrefix = "app://";
            // We always want to have a tripple slash
            frame.filename =
              frame.filename.indexOf("/") === 0
                ? `${appPrefix}${frame.filename}`
                : `${appPrefix}/${frame.filename}`;
          }
          return frame;
        }
      }),
      new DeviceContext()
    );
  }
  if (options.enableNative === undefined) {
    options.enableNative = true;
  }
  if (options.enableNativeCrashHandling === undefined) {
    options.enableNativeCrashHandling = true;
  }
  if (options.enableNativeNagger === undefined) {
    options.enableNativeNagger = true;
  }
  // tslint:enable: strict-comparisons
  initAndBind(ReactNativeClient, options);

  // TODO: Regist scope syncing here
  // Workaround for setting release/dist on native
  // const scope = getCurrentHub().getScope();
  // if (scope) {
  //   scope.addScopeListener(internalScope => {
  //     console.log(internalScope);
  //     // RNSentry.extraUpdated((internalScope as any)._extra)
  //   });
  // }

  // tslint:disable-next-line: no-unsafe-any
  if (getGlobalObject<any>().HermesInternal) {
    getCurrentHub().setTag("hermes", "true");
  }
}

/**
 * Sets the release on the event.
 */
export function setRelease(release: string): void {
  setExtra("__sentry_release", release);
}

/**
 * Sets the dist on the event.
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
