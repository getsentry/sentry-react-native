/* eslint-disable complexity */
import type { Integration, Log } from '@sentry/core';
import { debug } from '@sentry/core';
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
              processLog(log);
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

function processLog(log: Log): void {
  if (NativeCache === undefined) {
    return;
  }

  log.attributes = log.attributes ?? {};
  NativeCache.brand && (log.attributes['device.brand'] = NativeCache.brand);
  NativeCache.model && (log.attributes['device.model'] = NativeCache.model);
  NativeCache.family && (log.attributes['device.family'] = NativeCache.family);
  NativeCache.os && (log.attributes['os.name'] = NativeCache.os);
  NativeCache.version && (log.attributes['os.version'] = NativeCache.version);
  NativeCache.release && (log.attributes['sentry.release'] = NativeCache.release);
}
