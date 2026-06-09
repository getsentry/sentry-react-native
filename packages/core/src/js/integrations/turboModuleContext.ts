import type { Integration } from '@sentry/core';

import { wrapTurboModule } from '../turbomodule';
import { getRNSentryModule } from '../wrapper';

export const INTEGRATION_NAME = 'TurboModuleContext';

export interface TurboModuleContextOptions {
  /**
   * Additional TurboModules to track. Each entry's methods will be wrapped so
   * that any native crash happening inside a method call gets `contexts.turbo_module`
   * + `turbo_module.name` / `turbo_module.method` attached to the crash report.
   *
   * The built-in `RNSentry` TurboModule is always tracked.
   */
  modules?: Array<{ name: string; module: object | null | undefined; skipMethods?: ReadonlyArray<string> }>;
}

// Methods on RNSentry that must NOT be tracked:
//
// - `addListener` / `removeListeners` are RN event-emitter stubs that fire on
//   every subscriber registration — tracking them would just churn the scope.
//
// - The scope-sync methods (`setContext`, `setTag`, `setExtra`, `setUser`,
//   `addBreadcrumb`, `clearBreadcrumbs`, `setAttribute`, `setAttributes`,
//   `removeAttribute`) are called by our own `enableSyncToNative` hook every
//   time anything writes to a JS Scope. Tracking them would cause infinite
//   recursion: `pushTurboModuleCall` -> `scope.setContext` -> `NATIVE.setContext`
//   -> `RNSentry.setContext` (wrapped) -> `pushTurboModuleCall` -> ... .
const RNSENTRY_SKIP = [
  'addListener',
  'removeListeners',
  'setContext',
  'setTag',
  'setExtra',
  'setUser',
  'addBreadcrumb',
  'clearBreadcrumbs',
  'setAttribute',
  'setAttributes',
  'removeAttribute',
] as const;

/**
 * Attaches the currently-executing TurboModule method to the Sentry scope so
 * that native crashes can be attributed to the high-level RN module + method
 * (e.g. `RNSentry.captureEnvelope`) on top of the native stack trace.
 *
 * The active call is mirrored as `contexts.turbo_module` and the
 * `turbo_module.name` / `turbo_module.method` tags, both of which are already
 * synced to the native SDKs by the existing scope-sync hooks and therefore end
 * up in crash reports captured by sentry-cocoa / sentry-java.
 *
 * See https://github.com/getsentry/sentry-react-native/issues/6163.
 */
export const turboModuleContextIntegration = (options: TurboModuleContextOptions = {}): Integration => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // Wrap the live RNSentry TurboModule. Other integrations import the same
      // instance by reference, so wrapping here transparently tracks every call
      // made from JS — including the SDK's own internal envelope/scope sync
      // calls, which are the most likely entry points for native crashes.
      wrapTurboModule('RNSentry', getRNSentryModule(), { skip: RNSENTRY_SKIP });

      for (const entry of options.modules ?? []) {
        wrapTurboModule(entry.name, entry.module, { skip: entry.skipMethods });
      }
    },
  };
};
