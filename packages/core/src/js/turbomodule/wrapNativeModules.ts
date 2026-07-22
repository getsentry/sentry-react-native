import { logger } from '@sentry/core';
import { NativeModules } from 'react-native';

import { isTurboModuleEnabled } from '../utils/environment';
import { wrapTurboModule } from './wrapTurboModule';

export interface WrapNativeModulesOptions {
  skipModules?: ReadonlyArray<string>;
  skipMethodsPerModule?: Readonly<Record<string, ReadonlyArray<string>>>;
}

// `RNSentry` is wrapped explicitly by the integration with a curated skip
// list — re-wrapping here would double-record and recurse via scope-sync.
const IMPLICIT_MODULE_SKIP = new Set<string>(['RNSentry']);

/**
 * Wraps every legacy `NativeModules.*` on Old Architecture so bridge calls
 * feed the same aggregator / attribution / breadcrumb surface as TurboModules.
 * No-op on New Architecture.
 */
export function wrapAllNativeModules(options: WrapNativeModulesOptions = {}): string[] {
  if (isTurboModuleEnabled()) {
    return [];
  }

  const skipModules = new Set<string>(IMPLICIT_MODULE_SKIP);
  for (const name of options.skipModules ?? []) {
    skipModules.add(name);
  }
  const skipMethodsPerModule = options.skipMethodsPerModule ?? {};

  const wrapped: string[] = [];
  let moduleNames: string[];
  try {
    moduleNames = Object.keys(NativeModules);
  } catch (e) {
    logger.warn(`[TurboModuleTracker] Failed to enumerate NativeModules for legacy wrapping: ${String(e)}`);
    return wrapped;
  }

  for (const name of moduleNames) {
    if (skipModules.has(name)) {
      continue;
    }
    let mod: unknown;
    try {
      mod = (NativeModules as Record<string, unknown>)[name];
    } catch {
      continue;
    }
    if (!mod || typeof mod !== 'object') {
      continue;
    }
    wrapTurboModule(name, mod, {
      skip: skipMethodsPerModule[name],
      arch: 'legacy',
    });
    wrapped.push(name);
  }

  return wrapped;
}
