/* eslint-disable complexity */
import type { Integration, Log } from '@sentry/core';
import { debug, getCurrentScope, getGlobalScope, getIsolationScope } from '@sentry/core';
import type { ReactNativeClient } from '../client';
import { NATIVE } from '../wrapper';

const INTEGRATION_NAME = 'LogEnricher';

export const logEnricherIntegration = (): Integration => {
  return {
    name: INTEGRATION_NAME,
    setup(client: ReactNativeClient) {
      client.on('afterInit', () => {
        cacheLogContext().then(
          () => {
            client.on('beforeCaptureLog', (log: Log) => {
              processLog(log, client);
            });
          },
          reason => {
            debug.log(reason);
          },
        );
      });
    },
  };
};

let NativeCache: Record<string, unknown> | undefined = undefined;

/**
 * Sets a log attribute if the value exists and the attribute key is not already present.
 *
 * @param logAttributes - The log attributes object to modify.
 * @param key - The attribute key to set.
 * @param value - The value to set (only sets if not null/undefined and key not present).
 * @param setEvenIfPresent - Whether to set the attribute if it is present. Defaults to true.
 */
function setLogAttribute(
  logAttributes: Record<string, unknown>,
  key: string,
  value: unknown,
  setEvenIfPresent = true,
): void {
  if (value != null && (!logAttributes[key] || setEvenIfPresent)) {
    logAttributes[key] = value;
  }
}

async function cacheLogContext(): Promise<void> {
  try {
    const response = await NATIVE.fetchNativeLogAttributes();

    NativeCache = {
      ...(response?.contexts?.device && {
        brand: response.contexts.device?.brand,
        model: response.contexts.device?.model,
        family: response.contexts.device?.family,
      }),
      ...(response?.contexts?.os && {
        os: response.contexts.os.name,
        version: response.contexts.os.version,
      }),
      ...(response?.contexts?.release && {
        release: response.contexts.release,
      }),
    };
  } catch (e) {
    return Promise.reject(`[LOGS]: Failed to prepare attributes from Native Layer: ${e}`);
  }
  return Promise.resolve();
}

function processLog(log: Log, client: ReactNativeClient): void {
  if (NativeCache === undefined) {
    return;
  }

  // Save log.attributes to a new variable
  const logAttributes = log.attributes ?? {};

  // Apply scope attributes from all active scopes (global, isolation, and current)
  // These are applied first so they can be overridden by more specific attributes
  const scopeAttributes = collectScopeAttributes();
  Object.keys(scopeAttributes).forEach((key: string) => {
    setLogAttribute(logAttributes, key, scopeAttributes[key], false);
  });

  // Use setLogAttribute with the variable instead of direct assignment
  setLogAttribute(logAttributes, 'device.brand', NativeCache.brand);
  setLogAttribute(logAttributes, 'device.model', NativeCache.model);
  setLogAttribute(logAttributes, 'device.family', NativeCache.family);
  setLogAttribute(logAttributes, 'os.name', NativeCache.os);
  setLogAttribute(logAttributes, 'os.version', NativeCache.version);
  setLogAttribute(logAttributes, 'sentry.release', NativeCache.release);

  const replay = client.getIntegrationByName<Integration & { getReplayId: () => string | null }>('MobileReplay');
  setLogAttribute(logAttributes, 'sentry.replay_id', replay?.getReplayId());

  // Set log.attributes to the variable
  log.attributes = logAttributes;
}

/**
 * Extracts primitive attributes from a scope and merges them into the target object.
 * Only string, number, and boolean attribute values are included.
 *
 * @param scope - The scope to extract attributes from
 * @param target - The target object to merge attributes into
 */
function extractScopeAttributes(
  scope: ReturnType<typeof getCurrentScope>,
  target: Record<string, string | number | boolean>,
): void {
  if (scope && typeof scope.getScopeData === 'function') {
    const scopeAttrs = scope?.getScopeData?.().attributes || {};
    Object.keys(scopeAttrs).forEach(key => {
      const value = scopeAttrs[key];
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        target[key] = value;
      }
    });
  }
}

/**
 * Collects attributes from all active scopes (global, isolation, and current).
 * Only string, number, and boolean attribute values are supported.
 * Attributes are merged in order of precedence: global < isolation < current.
 *
 * @returns A merged object containing all scope attributes.
 */
function collectScopeAttributes(): Record<string, string | number | boolean> {
  const attributes: Record<string, string | number | boolean> = {};

  // Collect attributes from all scopes in order of precedence
  extractScopeAttributes(getGlobalScope(), attributes);
  extractScopeAttributes(getIsolationScope(), attributes);
  extractScopeAttributes(getCurrentScope(), attributes);

  return attributes;
}
