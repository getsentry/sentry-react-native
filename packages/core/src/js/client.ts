import { eventFromException, eventFromMessage } from '@sentry/browser';
import type {
  ClientReportEnvelope,
  ClientReportItem,
  Envelope,
  Event,
  EventHint,
  Outcome,
  SeverityLevel,
  TransportMakeRequestResponse,
  UserFeedback,
} from '@sentry/core';
import { BaseClient, dateTimestampInSeconds, logger, SentryError } from '@sentry/core';
import { Alert } from 'react-native';

import { getDevServer } from './integrations/debugsymbolicatorutils';
import { defaultSdkInfo } from './integrations/sdkinfo';
import { getDefaultSidecarUrl } from './integrations/spotlight';
import type { ReactNativeClientOptions } from './options';
import type { mobileReplayIntegration } from './replay/mobilereplay';
import { MOBILE_REPLAY_INTEGRATION_NAME } from './replay/mobilereplay';
import { createUserFeedbackEnvelope, items } from './utils/envelope';
import { ignoreRequireCycleLogs } from './utils/ignorerequirecyclelogs';
import { mergeOutcomes } from './utils/outcome';
import { ReactNativeLibraries } from './utils/rnlibraries';
import { NATIVE } from './wrapper';

/**
 * The Sentry React Native SDK Client.
 *
 * @see ReactNativeClientOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
export class ReactNativeClient extends BaseClient<ReactNativeClientOptions> {
  private _outcomesBuffer: Outcome[];

  /**
   * Creates a new React Native SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: ReactNativeClientOptions) {
    ignoreRequireCycleLogs(ReactNativeLibraries.ReactNativeVersion?.version);
    options._metadata = options._metadata || {};
    options._metadata.sdk = options._metadata.sdk || defaultSdkInfo;
    // We default this to true, as it is the safer scenario
    options.parentSpanIsAlwaysRootSpan =
      options.parentSpanIsAlwaysRootSpan === undefined ? true : options.parentSpanIsAlwaysRootSpan;
    super(options);

    this._outcomesBuffer = [];
  }

  /**
   * @inheritDoc
   */
  public eventFromException(exception: unknown, hint: EventHint = {}): PromiseLike<Event> {
    return eventFromException(this._options.stackParser, exception, hint, this._options.attachStacktrace);
  }

  /**
   * @inheritDoc
   */
  public eventFromMessage(message: string, level?: SeverityLevel, hint?: EventHint): PromiseLike<Event> {
    return eventFromMessage(this._options.stackParser, message, level, hint, this._options.attachStacktrace);
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
   * @deprecated Use `Sentry.captureFeedback` instead.
   */
  public captureUserFeedback(feedback: UserFeedback): void {
    const envelope = createUserFeedbackEnvelope(feedback, {
      metadata: this._options._metadata,
      dsn: this.getDsn(),
      tunnel: undefined,
    });
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.sendEnvelope(envelope);
  }

  /**
   * @inheritdoc
   */
  public sendEnvelope(envelope: Envelope): PromiseLike<TransportMakeRequestResponse> {
    const outcomes = this._clearOutcomes();
    this._outcomesBuffer = mergeOutcomes(this._outcomesBuffer, outcomes);

    if (this._options.sendClientReports) {
      this._attachClientReportTo(this._outcomesBuffer, envelope as ClientReportEnvelope);
    }

    let shouldClearOutcomesBuffer = true;
    if (this._isEnabled() && this._transport && this._dsn) {
      this.emit('beforeEnvelope', envelope);

      this._transport.send(envelope).then(null, reason => {
        if (reason instanceof SentryError) {
          // SentryError is thrown by SyncPromise
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

    return Promise.resolve({});
  }

  /**
   * @inheritDoc
   */
  public init(): void {
    super.init();
    this._initNativeSdk();
  }

  /**
   * Register a hook on this client.
   *
   * (Generic method signature to allow for custom React Native Client events.)
   */
  public on(hook: string, callback: unknown): () => void {
    // @ts-expect-error on from the base class doesn't support generic types
    return super.on(hook, callback);
  }

  /**
   * Emit a hook that was previously registered via `on()`.
   *
   * (Generic method signature to allow for custom React Native Client events.)
   */
  public emit(hook: string, ...rest: unknown[]): void {
    // @ts-expect-error emit from the base class doesn't support generic types
    super.emit(hook, ...rest);
  }

  /**
   * Starts native client with dsn and options
   */
  private _initNativeSdk(): void {
    NATIVE.initNativeSdk({
      ...this._options,
      defaultSidecarUrl: getDefaultSidecarUrl(),
      devServerUrl: getDevServer()?.url || '',
      mobileReplayOptions:
        this._integrations[MOBILE_REPLAY_INTEGRATION_NAME] &&
        'options' in this._integrations[MOBILE_REPLAY_INTEGRATION_NAME]
          ? (this._integrations[MOBILE_REPLAY_INTEGRATION_NAME] as ReturnType<typeof mobileReplayIntegration>).options
          : undefined,
    })
      .then(
        (result: boolean) => {
          return result;
        },
        () => {
          this._showCannotConnectDialog();
          return false;
        },
      )
      .then((didCallNativeInit: boolean) => {
        this._options.onReady?.({ didCallNativeInit });
        this.emit('afterInit');
      })
      .then(undefined, error => {
        logger.error('The OnReady callback threw an error: ', error);
      });
  }

  /**
   * If the user is in development mode, and the native nagger is enabled then it will show an alert.
   */
  private _showCannotConnectDialog(): void {
    if (__DEV__ && this._options.enableNativeNagger) {
      Alert.alert(
        'Sentry',
        'Warning, could not connect to Sentry native SDK.\nIf you do not want to use the native component please pass `enableNative: false` in the options.\nVisit: https://docs.sentry.io/platforms/react-native/ for more details.',
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
