import { defaultIntegrations, getCurrentHub } from "@sentry/react";
import { initAndBind, setExtra } from "@sentry/core";
import { Hub, makeMain } from "@sentry/hub";
import { RewriteFrames } from "@sentry/integrations";
import { StackFrame } from "@sentry/types";
import { getGlobalObject } from "@sentry/utils";

import { ReactNativeOptions } from "./backend";
import { ReactNativeClient } from "./client";
import {
  DebugSymbolicator,
  DeviceContext,
  ReactNativeErrorHandlers,
  Release,
} from "./integrations";
import { ReactNativeScope } from "./scope";

// const { RNSentry } = NativeModules;

const IGNORED_DEFAULT_INTEGRATIONS = [
  "GlobalHandlers", // We will use the react-native internal handlers
  "TryCatch", // We don't need this
];
const DEFAULT_OPTIONS: ReactNativeOptions = {
  enableNative: true,
  enableNativeCrashHandling: true,
  enableNativeNagger: true,
};

/**
 * Inits the SDK
 */
export function init(
  options: ReactNativeOptions = {
    enableNative: true,
    enableNativeCrashHandling: true,
  }
): void {
  const reactNativeHub = new Hub(undefined, new ReactNativeScope());
  makeMain(reactNativeHub);
  options = {
    ...DEFAULT_OPTIONS,
    ...options
  }

  // tslint:disable: strict-comparisons
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
              .replace(/^file\:\/\//, "")
              .replace(/^address at /, "")
              .replace(/^.*\/[^\.]+(\.app|CodePush|.*(?=\/))/, "");

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

  // set the event.origin tag.
  getCurrentHub().setTag("event.origin", "javascript");

  // tslint:disable-next-line: no-unsafe-any
  if (getGlobalObject<any>().HermesInternal) {
    getCurrentHub().setTag("hermes", "true");
  }
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
