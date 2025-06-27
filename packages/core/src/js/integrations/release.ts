import type { BaseTransportOptions, Client, ClientOptions, Event, EventHint, Integration } from '@sentry/core';

import { isExpo, isWeb } from '../utils/environment';
import { NATIVE } from '../wrapper';

const INTEGRATION_NAME = 'Release';

interface ExpoConfig {
  name?: string;
  version?: string;
}

let Constants: { default?: { manifest?: unknown }; manifest?: unknown } | null = null;
try {
  // eslint-disable-next-line import/no-extraneous-dependencies
  Constants = require('expo-constants');
} catch {
  // expo-constants not available, do nothing
}

/** Release integration responsible to load release from file. */
export const nativeReleaseIntegration = (): Integration => {
  return {
    name: INTEGRATION_NAME,
    setupOnce: () => {
      // noop
    },
    processEvent,
  };
};

/**
 * Get Expo Web configuration name and version from environment variables or Constants
 */
function getExpoWebConfig(): ExpoConfig | null {
  if (!isWeb() || !isExpo()) {
    return null;
  }

  try {
    // Environment variables (development)
    const processEnv = (globalThis as { process?: { env?: Record<string, string> } }).process?.env;
    if (processEnv && processEnv?.EXPO_PUBLIC_APP_NAME && processEnv?.EXPO_PUBLIC_APP_VERSION) {
      return {
        name: processEnv.EXPO_PUBLIC_APP_NAME,
        version: processEnv.EXPO_PUBLIC_APP_VERSION,
      };
    }

    // Expo-constants (production)
    if (Constants) {
      const constantsObj = Constants.default || Constants;

      if (constantsObj && typeof constantsObj === 'object' && 'manifest' in constantsObj) {
        let manifest = constantsObj.manifest;

        if (typeof manifest === 'string') {
          try {
            manifest = JSON.parse(manifest) as unknown;
          } catch {
            return null;
          }
        }

        if (
          manifest &&
          typeof manifest === 'object' &&
          'name' in manifest &&
          'version' in manifest &&
          typeof (manifest as { name: unknown }).name === 'string' &&
          typeof (manifest as { version: unknown }).version === 'string'
        ) {
          const typedManifest = manifest as { name: string; version: string };
          return {
            name: typedManifest.name,
            version: typedManifest.version,
          };
        }
      }
    }
  } catch {
    // Config detection failed, do nothing
  }

  return null;
}

/**
 * Generates release string from Expo Web config
 */
function generateExpoWebRelease(config: ExpoConfig): string | null {
  const name = config.name;
  const version = config.version;

  if (!name || !version) {
    return null;
  }

  return `${name}@${version}`;
}

async function processEvent(
  event: Event,
  _: EventHint,
  client: Client<ClientOptions<BaseTransportOptions>>,
): Promise<Event> {
  const options = client.getOptions();

  /*
    Priority order:
    1. __sentry_release and __sentry_dist set by user with setRelease and setDist (strongest)
    2. release and dist in options passed on init
    3. Native release (mobile)
    4. Expo Web auto-detection
  */
  if (typeof event.extra?.__sentry_release === 'string') {
    event.release = `${event.extra.__sentry_release}`;
  } else if (typeof options?.release === 'string') {
    event.release = options.release;
  }

  if (typeof event.extra?.__sentry_dist === 'string') {
    event.dist = `${event.extra.__sentry_dist}`;
  } else if (typeof options?.dist === 'string') {
    event.dist = options.dist;
  }

  if (event.release && event.dist) {
    return event;
  }

  try {
    const nativeRelease = await NATIVE.fetchNativeRelease();
    if (nativeRelease) {
      if (!event.release) {
        event.release = `${nativeRelease.id}@${nativeRelease.version}+${nativeRelease.build}`;
      }
      if (!event.dist) {
        event.dist = `${nativeRelease.build}`;
      }
    }
  } catch (_Oo) {
    // Something went wrong, we just continue
  }

  if (!event.release && isExpo() && isWeb()) {
    try {
      const expoConfig = getExpoWebConfig();
      if (expoConfig) {
        const autoRelease = generateExpoWebRelease(expoConfig);
        if (autoRelease) {
          event.release = autoRelease;
        }
      }
    } catch {
      // Something went wrong, we just continue
    }
  }

  return event;
}
