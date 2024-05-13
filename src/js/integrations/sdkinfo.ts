import { convertIntegrationFnToClass } from '@sentry/core';
import type {
  Event,
  Integration,
  IntegrationClass,
  IntegrationFnResult,
  Package,
  SdkInfo as SdkInfoType,
} from '@sentry/types';
import { logger } from '@sentry/utils';

import { isExpoGo, notWeb } from '../utils/environment';
import { SDK_NAME, SDK_PACKAGE_NAME, SDK_VERSION } from '../version';
import { NATIVE } from '../wrapper';

const INTEGRATION_NAME = 'SdkInfo';

type DefaultSdkInfo = Pick<Required<SdkInfoType>, 'name' | 'packages' | 'version'>;

export const defaultSdkInfo: DefaultSdkInfo = {
  name: SDK_NAME,
  packages: [
    {
      name: SDK_PACKAGE_NAME,
      version: SDK_VERSION,
    },
  ],
  version: SDK_VERSION,
};

/** Default SdkInfo instrumentation */
export const sdkInfoIntegration = (): IntegrationFnResult => {
  const fetchNativeSdkInfo = createCachedFetchNativeSdkInfo();

  return {
    name: INTEGRATION_NAME,
    setupOnce: () => {
      // noop
    },
    processEvent: (event: Event) => processEvent(event, fetchNativeSdkInfo),
  };
};

/**
 * Default SdkInfo instrumentation
 *
 * @deprecated Use `sdkInfoIntegration()` instead.
 */
// eslint-disable-next-line deprecation/deprecation
export const SdkInfo = convertIntegrationFnToClass(
  INTEGRATION_NAME,
  sdkInfoIntegration,
) as IntegrationClass<Integration>;

async function processEvent(event: Event, fetchNativeSdkInfo: () => Promise<Package | null>): Promise<Event> {
  const nativeSdkPackage = await fetchNativeSdkInfo();

  event.platform = event.platform || 'javascript';
  event.sdk = event.sdk || {};
  event.sdk.name = event.sdk.name || defaultSdkInfo.name;
  event.sdk.version = event.sdk.version || defaultSdkInfo.version;
  event.sdk.packages = [
    // default packages are added by baseclient and should not be added here
    ...(event.sdk.packages || []),
    ...((nativeSdkPackage && [nativeSdkPackage]) || []),
  ];

  return event;
}

function createCachedFetchNativeSdkInfo(): () => Promise<Package | null> {
  if (!notWeb() || isExpoGo()) {
    return () => {
      return Promise.resolve(null);
    };
  }

  let isCached: boolean = false;
  let nativeSdkPackageCache: Package | null = null;

  return async () => {
    if (isCached) {
      return nativeSdkPackageCache;
    }

    try {
      nativeSdkPackageCache = await NATIVE.fetchNativeSdkInfo();
      isCached = true;
    } catch (e) {
      logger.warn('Could not fetch native sdk info.', e);
    }

    return nativeSdkPackageCache;
  };
}
