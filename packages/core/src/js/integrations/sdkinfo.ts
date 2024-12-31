import type { Event, Integration, Package, SdkInfo as SdkInfoType } from '@sentry/core';
import { logger } from '@sentry/core';

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
export const sdkInfoIntegration = (): Integration => {
  const fetchNativeSdkInfo = createCachedFetchNativeSdkInfo();

  return {
    name: INTEGRATION_NAME,
    setupOnce: () => {
      // noop
    },
    processEvent: (event: Event) => processEvent(event, fetchNativeSdkInfo),
  };
};

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
