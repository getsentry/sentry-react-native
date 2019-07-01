import {
  defaultIntegrations,
  getCurrentHub,
  Integrations
} from "@sentry/browser";
import { RewriteFrames } from "@sentry/integrations";
import { initAndBind } from "@sentry/core";
import { setExtra } from "@sentry/minimal";
import { StackFrame } from "@sentry/types";

import { ReactNativeOptions } from "./backend";
import { ReactNativeClient } from "./client";
import {
  DeviceContext,
  ReactNativeErrorHandlers,
  Release
} from "./integrations";

/**
 * Inits the SDK
 */
export function init(
  options: ReactNativeOptions = {
    enableNative: true,
    enableNativeCrashHandling: true
  }
): void {
  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = [
      new ReactNativeErrorHandlers(),
      new Release(),
      ...defaultIntegrations.filter(
        integration =>
          integration.name !== "GlobalHandlers" && // We will use the react-native internal handlers
          integration.name !== "Breadcrumbs" && // We add it later, just not patching fetch
          integration.name !== "TryCatch" // We don't need this
      ),
      new Integrations.Breadcrumbs({
        fetch: false
      }),
      new RewriteFrames({
        iteratee: (frame: StackFrame) => {
          if (frame.filename) {
            frame.filename =
              "app://" +
              frame.filename
                .replace(/^file\:\/\//, "")
                .replace(/^.*\/[^\.]+(\.app|CodePush|.*(?=\/))/, "");
          }
          return frame;
        }
      }),
      new DeviceContext()
    ];
  }
  if (options.enableNative === undefined) {
    options.enableNative = true;
  }
  if (options.enableNativeCrashHandling === undefined) {
    options.enableNativeCrashHandling = true;
  }
  initAndBind(ReactNativeClient, options);
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
