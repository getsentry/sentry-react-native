import type { Event, Integration, Package, SdkInfo as SdkInfoType } from '@sentry/core';
import { logger } from '@sentry/core';
import { isExpoGo, notWeb } from '../utils/environment';
import { SDK_NAME, SDK_PACKAGE_NAME, SDK_VERSION } from '../version';
import { NATIVE } from '../wrapper';

// TODO: Remove this on JS V10.
interface IpPatchedSdkInfo extends SdkInfoType {
  settings?: {
    infer_ip?: 'auto' | 'never';
  };
}

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
let DefaultPii: boolean | undefined = undefined;

/** Default SdkInfo instrumentation */
export const sdkInfoIntegration = (): Integration => {
  const fetchNativeSdkInfo = createCachedFetchNativeSdkInfo();

  return {
    name: INTEGRATION_NAME,
    setup(client) {
      const options = client.getOptions();
      DefaultPii = options.sendDefaultPii;
      if (DefaultPii) {
        client.on('beforeSendEvent', event => {
          if (event.user?.ip_address === '{{auto}}') {
            delete event.user.ip_address;
          }
        });
      }
    },
    setupOnce: () => {
      // noop
    },
    processEvent: (event: Event) => processEvent(event, fetchNativeSdkInfo),
  };
};

async function processEvent(event: Event, fetchNativeSdkInfo: () => Promise<Package | null>): Promise<Event> {
  const nativeSdkPackage = await fetchNativeSdkInfo();

  event.platform = event.platform || 'javascript';
  const sdk = (event.sdk || {}) as IpPatchedSdkInfo;
  sdk.name = sdk.name || defaultSdkInfo.name;
  sdk.version = sdk.version || defaultSdkInfo.version;
  sdk.packages = [
    // default packages are added by baseclient and should not be added here
    ...(sdk.packages || []),
    ...((nativeSdkPackage && [nativeSdkPackage]) || []),
  ];

  // Patch missing infer_ip.
  sdk.settings = {
    infer_ip: DefaultPii ? 'auto' : 'never',
    // purposefully allowing already passed settings to override the default
    ...sdk.settings,
  };

  event.sdk = sdk;

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
