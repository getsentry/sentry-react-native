import { BrowserClient, defaultStackParser, makeFetchTransport } from '@sentry/browser';
import { FetchImpl } from '@sentry/browser/types/transports/utils';
import { BaseClient } from '@sentry/core';
import {
  ClientReportEnvelope,
  ClientReportItem,
  Envelope,
  Event,
  EventHint,
  Outcome,
  SeverityLevel,
  Transport,
  UserFeedback,
} from '@sentry/types';
import { dateTimestampInSeconds, logger, SentryError } from '@sentry/utils';
// @ts-ignore LogBox introduced in RN 0.63
import { Alert, LogBox, YellowBox } from 'react-native';

import { defaultSdkInfo } from './integrations/sdkinfo';
import { ReactNativeClientOptions, ReactNativeTransportOptions } from './options';
import { makeReactNativeTransport } from './transports/native';
import { createUserFeedbackEnvelope, items } from './utils/envelope';
import { mergeOutcomes } from './utils/outcome';
import { NATIVE } from './wrapper';

/**
 * The Sentry React Native SDK Client.
 *
 * @see ReactNativeClientOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
export class ReactNativeClient extends BaseClient<ReactNativeClientOptions> {

  private _outcomesBuffer: Outcome[];

  private readonly _browserClient: BrowserClient;

  /**
   * Creates a new React Native SDK instance.
   * @param options Configuration options for this SDK.
   */
   public constructor(options: ReactNativeClientOptions) {
     if (!options.transport) {
       options.transport = (options: ReactNativeTransportOptions, nativeFetch?: FetchImpl): Transport => {
         if (NATIVE.isNativeTransportAvailable()) {
           return makeReactNativeTransport(options);
         }
         return makeFetchTransport(options, nativeFetch);
       };
     }
     options._metadata = options._metadata || {};
     options._metadata.sdk = options._metadata.sdk || defaultSdkInfo;
     super(options);

      this._outcomesBuffer = [];

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
      transportOptions: options.transportOptions,
      stackParser: options.stackParser || defaultStackParser,
      integrations: [],
      _metadata: options._metadata,
      attachStacktrace: options.attachStacktrace,
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
   * Sends user feedback to Sentry.
   */
  public captureUserFeedback(feedback: UserFeedback): void {
    const envelope = createUserFeedbackEnvelope(
      feedback,
      {
        metadata: this._options._metadata,
        dsn: this.getDsn(),
        tunnel: this._options.tunnel,
      },
    );
    this._sendEnvelope(envelope);
  }

  /**
   * @inheritdoc
   */
  protected _sendEnvelope(envelope: Envelope): void {
    const outcomes = this._clearOutcomes();
    this._outcomesBuffer = mergeOutcomes(this._outcomesBuffer, outcomes);

    if (this._options.sendClientReports) {
      this._attachClientReportTo(this._outcomesBuffer, envelope as ClientReportEnvelope);
    }

    let shouldClearOutcomesBuffer = true;
    if (this._transport && this._dsn) {
      this._transport.send(envelope)
        .then(null, reason => {
          if (reason instanceof SentryError) { // SentryError is thrown by SyncPromise
            shouldClearOutcomesBuffer = false;
            // If this is called asynchronously we want the _outcomesBuffer to be cleared
            logger.error('SentryError while sending event, keeping outcomes buffer:', reason);
          } else {
            logger.error('Error while sending event:', reason);
          }
        });
    } else {
      logger.error('Transport disabled');
    }

    if (shouldClearOutcomesBuffer) {
      this._outcomesBuffer = []; // if send fails synchronously the _outcomesBuffer will stay intact
    }
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
    } finally {
      try {
        this._options.onReady?.({ didCallNativeInit });
      } catch (error) {
        logger.error('The OnReady callback threw an error: ', error);
      }
    }
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

  /**
   * Attaches a client report from outcomes to the envelope.
   */
  private _attachClientReportTo(outcomes: Outcome[], envelope: ClientReportEnvelope): void {
    if (outcomes.length > 0) {
      const clientReportItem: ClientReportItem = [
        { type: 'client_report' },
        {
          timestamp: dateTimestampInSeconds(),
          discarded_events: outcomes,
        },
      ];

      envelope[items].push(clientReportItem);
    }
  }
}
