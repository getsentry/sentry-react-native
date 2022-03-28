import { EventProcessor, Integration, Package } from '@sentry/types';
import { logger } from '@sentry/utils';

import { SDK_NAME, SDK_VERSION } from '../version';
import { NATIVE } from '../wrapper';

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
        name: SDK_NAME,
        packages: [
          ...((event.sdk && event.sdk.packages) || []),
          ...((this._nativeSdkInfo && [this._nativeSdkInfo]) || []),
          {
            name: 'npm:@sentry/react-native',
            version: SDK_VERSION,
          },
        ],
        version: SDK_VERSION,
      };

      return event;
    });
  }
}
