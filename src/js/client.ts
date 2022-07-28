import { BrowserClient, defaultStackParser, makeFetchTransport } from '@sentry/browser';
import { BrowserTransportOptions } from '@sentry/browser/types/transports/types';
import { FetchImpl } from '@sentry/browser/types/transports/utils';
import { BaseClient } from '@sentry/core';
import { Event, EventHint, SeverityLevel, Transport } from '@sentry/types';
// @ts-ignore LogBox introduced in RN 0.63
import { Alert, LogBox, YellowBox } from 'react-native';

import { ReactNativeClientOptions } from './options';
import { NativeTransport } from './transports/native';
import { NATIVE } from './wrapper';

/**
 * The Sentry React Native SDK Client.
 *
 * @see ReactNativeClientOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
export class ReactNativeClient extends BaseClient<ReactNativeClientOptions> {

  private readonly _browserClient: BrowserClient;

  /**
   * Creates a new React Native SDK instance.
   * @param options Configuration options for this SDK.
   */
   public constructor(options: ReactNativeClientOptions) {
     if (!options.transport) {
       options.transport = (options: BrowserTransportOptions, nativeFetch?: FetchImpl): Transport => {
         if (NATIVE.isNativeTransportAvailable()) {
           return new NativeTransport();
         }
         return makeFetchTransport(options, nativeFetch);
       };
     }
     super(options);

    // This is a workaround for now using fetch on RN, this is a known issue in react-native and only generates a warning
    // YellowBox deprecated and replaced with with LogBox in RN 0.63
    if (LogBox) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      LogBox.ignoreLogs(['Require cycle:']);
    } else {
      // eslint-disable-next-line deprecation/deprecation
      YellowBox.ignoreWarnings(['Require cycle:']);
    }

    this._browserClient = new BrowserClient({
      dsn: options.dsn,
      transport: options.transport,
      stackParser: options.stackParser || defaultStackParser,
      integrations: [],
    });

     void this._initNativeSdk();
   }


  /**
   * @inheritDoc
   */
  public eventFromException(_exception: unknown, _hint?: EventHint): PromiseLike<Event> {
    return this._browserClient.eventFromException(_exception, _hint);
  }

  /**
   * @inheritDoc
   */
  public eventFromMessage(_message: string, _level?: SeverityLevel, _hint?: EventHint): PromiseLike<Event> {
    return this._browserClient.eventFromMessage(_message, _level, _hint);
  }

  /**
   * If native client is available it will trigger a native crash.
   * Use this only for testing purposes.
   */
  public nativeCrash(): void {
    NATIVE.nativeCrash();
  }

  /**
   * @inheritDoc
   */
  public close(): PromiseLike<boolean> {
    // As super.close() flushes queued events, we wait for that to finish before closing the native SDK.
    return super.close().then((result: boolean) => {
      return NATIVE.closeNativeSdk().then(() => result) as PromiseLike<boolean>;
    });
  }

  /**
 * Starts native client with dsn and options
 */
  private async _initNativeSdk(): Promise<void> {
    let didCallNativeInit = false;

    try {
      didCallNativeInit = await NATIVE.initNativeSdk(this._options);
    } catch (_) {
      this._showCannotConnectDialog();

      this._options.onReady?.({ didCallNativeInit: false });

      return;
    }
    this._options.onReady?.({ didCallNativeInit });
  }

  /**
   * If the user is in development mode, and the native nagger is enabled then it will show an alert.
   */
  private _showCannotConnectDialog(): void {
    if (__DEV__ && this._options.enableNativeNagger) {
      Alert.alert(
        'Sentry',
        'Warning, could not connect to Sentry native SDK.\nIf you do not want to use the native component please pass `enableNative: false` in the options.\nVisit: https://docs.sentry.io/platforms/react-native/#linking for more details.'
      );
    }
  }
}
