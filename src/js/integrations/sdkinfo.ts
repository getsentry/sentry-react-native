import { EventProcessor, Integration, Package, SdkInfo as SdkInfoType } from '@sentry/types';
import { logger } from '@sentry/utils';

import { SDK_NAME, SDK_PACKAGE_NAME,SDK_VERSION } from '../version';
import { NATIVE } from '../wrapper';

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
export class SdkInfo implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'SdkInfo';

  /**
   * @inheritDoc
   */
  public name: string = SdkInfo.id;

  private _nativeSdkInfo: Package | null = null;

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (e: EventProcessor) => void): void {
    addGlobalEventProcessor(async (event) => {
      // The native SDK info package here is only used on iOS as `beforeSend` is not called on `captureEnvelope`.
      // this._nativeSdkInfo should be defined a following time so this call won't always be awaited.
      if (NATIVE.platform === 'ios' && this._nativeSdkInfo === null) {
        try {
          this._nativeSdkInfo = await NATIVE.fetchNativeSdkInfo();
        } catch (e) {
          // If this fails, go ahead as usual as we would rather have the event be sent with a package missing.
          logger.warn(
            '[SdkInfo] Native SDK Info retrieval failed...something could be wrong with your Sentry installation:'
          );
          logger.warn(e);
        }
      }

      event.platform = event.platform || 'javascript';
      event.sdk = {
        ...(event.sdk ?? {}),
        ...defaultSdkInfo,
        packages: [
          ...((event.sdk && event.sdk.packages) || []),
          ...((this._nativeSdkInfo && [this._nativeSdkInfo]) || []),
        ],
      };

      return event;
    });
  }
}
