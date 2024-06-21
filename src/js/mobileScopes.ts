import type { Carrier } from '@sentry/core';
import { getIsolationScope, SDK_VERSION } from '@sentry/core';

import { ReactNativeScope } from './scope';
import type { SentryCarrier } from './utils/worldwide';
import { RN_GLOBAL_OBJ } from './utils/worldwide';

/**
 * You should never call this directly. It will be called by the SDK.
 * This is need as the native SDKs still have Hubs and Scopes.
 * To be able to ensure all expected data are applied to processed events
 * global an isolation scope are set to the same scope instance.
 *
 * @internal
 */
export function setIsolationScopeAsGlobal(): void {
  const carrier = getSentryCarrier(RN_GLOBAL_OBJ);
  carrier.globalScope = getIsolationScope();
}

/**
 * You should never call this directly. It will be called by the SDK.
 * React Native Scope implementation synchronizes with the native scope.
 *
 * @internal
 */
export function setReactNativeDefaultIsolationScope(): void {
  const carrier = getSentryCarrier(RN_GLOBAL_OBJ);
  carrier.defaultIsolationScope = new ReactNativeScope();
}

/**
 * Will either get the existing sentry carrier, or create a new one.
 *
 * @tmp This should be exported from @sentry/core
 * @internal
 */
export function getSentryCarrier(carrier: Carrier): SentryCarrier {
  const __SENTRY__ = (carrier.__SENTRY__ = carrier.__SENTRY__ || {});

  // For now: First SDK that sets the .version property wins
  // This has to use the version of the JS Core SDK otherwise we are reading
  // unused version of the carrier (the carrier is set by the JS Core SDK)
  __SENTRY__.version = __SENTRY__.version || SDK_VERSION;

  // Intentionally populating and returning the version of "this" SDK instance
  // rather than what's set in .version so that "this" SDK always gets its carrier
  return (__SENTRY__[SDK_VERSION] = __SENTRY__[SDK_VERSION] || {});
}
