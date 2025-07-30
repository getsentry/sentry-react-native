/* eslint-disable complexity */
import type { Integration, Log } from '@sentry/core';
import { logger } from '@sentry/core';
import {} from 'react-native';
import {} from '../breadcrumb';
import { NATIVE } from '../wrapper';

const INTEGRATION_NAME = 'LogEnricher';

export const logEnricherIntegration = (): Integration => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      setTimeout(() => {
        cacheLogContext().then(() => {
          client.on('beforeCaptureLog', log => {
            processLog(log);
          })
        },
          reason => {
            logger.log(reason);
          },
        );
      }, 1000);
    },
  };
};

let NativeCache: Record<string, unknown> | undefined = undefined;

async function cacheLogContext(): Promise<void> {
  try {
    const response = await NATIVE.fetchNativeLogAttributes();
    NativeCache = response?.contexts?.device && {
      brand: response.contexts.device.brand,
      model: response.contexts.device.model,
      family: response.contexts.device.family,
    };
    NativeCache = response?.contexts?.os && {
      ...NativeCache,
      os: response.contexts.os,
      version: response.contexts.version,
    };
    NativeCache = response?.contexts?.release && {
      ...NativeCache,
      release: response.contexts.release,
    };
  } catch (e) {
    return Promise.reject(`[LOGS]: Failed to prepare attributes from Native Layer: ${e}`);
  }
  return Promise.resolve();
}

function processLog(log: Log): void {
  if (NativeCache === undefined) {
    return;
  }

  log.attributes = log.attributes ?? {};
  NativeCache.brand && (log.attributes['device.brand'] = NativeCache.brand);
  NativeCache.model && (log.attributes['device.model'] = NativeCache.model);
  NativeCache.family && (log.attributes['device.family'] = NativeCache.family);
  NativeCache.name && (log.attributes['os.name'] = NativeCache.name);
  NativeCache.version && (log.attributes['os.version'] = NativeCache.version);
  NativeCache.release && (log.attributes['sentry.release'] = NativeCache.release);
}
