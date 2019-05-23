import { defaultIntegrations, Integrations, Transports } from "@sentry/browser";
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
          integration.name !== "GlobalHandlers" &&
          integration.name !== "Breadcrumbs" &&
          integration.name !== "TryCatch"
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
  if (options.transport === undefined) {
    options.transport = Transports.XHRTransport;
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
