import { getIsolationScope } from '@sentry/core';
import { getGlobalSingleton } from '@sentry/utils';

import { ReactNativeScope } from './scope';

/**
 * You should never call this directly. It will be called by the SDK.
 * This is need as the native SDKs still have Hubs and Scopes.
 * To be able to ensure all expected data are applied to processed events
 * global an isolation scope are set to the same scope instance.
 *
 * @internal
 */
export function setIsolationScopeAsGlobal(): void {
  getGlobalSingleton('globalScope', () => getIsolationScope());
}

/**
 * You should never call this directly. It will be called by the SDK.
 * React Native Scope implementation synchronizes with the native scope.
 *
 * @internal
 */
export function setReactNativeDefaultIsolationScope(): void {
  getGlobalSingleton('defaultIsolationScope', () => new ReactNativeScope());
}
