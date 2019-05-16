import { defaultIntegrations } from '@sentry/browser';
import { initAndBind } from '@sentry/core';
import { configureScope } from '@sentry/minimal';
import { Scope } from '@sentry/types';

import { ReactNativeOptions } from './backend';
import { ReactNativeClient } from './client';
import { ReactNative } from './integrations';

/**
 * Inits the SDK
 */
export function init(options: ReactNativeOptions): void {
  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = [...defaultIntegrations, new ReactNative()];
  }
  initAndBind(ReactNativeClient, options);
}

/**
 * Sets the release on the event.
 */
export function setRelease(release: string): void {
  configureScope((scope: Scope) => {
    scope.setExtra('__sentry_release', release);
  });
}

/**
 * Sets the dist on the event.
 */
export function setDist(dist: string): void {
  configureScope((scope: Scope) => {
    scope.setExtra('__sentry_dist', dist);
  });
}
