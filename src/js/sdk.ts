import { defaultIntegrations, Integrations } from "@sentry/browser";
import { RewriteFrames } from "@sentry/integrations";
import { initAndBind } from "@sentry/core";
import { configureScope } from "@sentry/minimal";
import { Scope, StackFrame } from "@sentry/types";

import { ReactNativeOptions } from "./backend";
import { ReactNativeClient } from "./client";
import { ReactNative } from "./integrations";

/**
 * Inits the SDK
 */
export function init(options: ReactNativeOptions): void {
  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = [
      new ReactNative(),
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
            frame.filename
              .replace(/^file\:\/\//, "")
              .replace(/^.*\/[^\.]+(\.app|CodePush|.*(?=\/))/, "");
          }
          return frame;
        }
      })
    ];
  }
  initAndBind(ReactNativeClient, options);
}

/**
 * Sets the release on the event.
 */
export function setRelease(release: string): void {
  configureScope((scope: Scope) => {
    scope.setExtra("__sentry_release", release);
  });
}

/**
 * Sets the dist on the event.
 */
export function setDist(dist: string): void {
  configureScope((scope: Scope) => {
    scope.setExtra("__sentry_dist", dist);
  });
}
