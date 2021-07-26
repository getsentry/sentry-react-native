import { BrowserBackend } from "@sentry/browser/dist/backend";
import { BaseBackend, getCurrentHub, NoopTransport } from "@sentry/core";
import { BrowserOptions, Transports } from "@sentry/react";
import { Event, EventHint, Severity, Transport } from "@sentry/types";
// @ts-ignore LogBox introduced in RN 0.63
import { Alert, LogBox, YellowBox } from "react-native";

import { ReactNativeOptions } from "./options";
import { ReactNativeTracing } from "./tracing";
import { NativeTransport } from "./transports/native";
import { NATIVE } from "./wrapper";

/** The Sentry ReactNative SDK Backend. */
export class ReactNativeBackend extends BaseBackend<BrowserOptions> {
  private readonly _browserBackend: BrowserBackend;

  /** Creates a new ReactNative backend instance. */
  public constructor(protected readonly _options: ReactNativeOptions) {
    super(_options);
    this._browserBackend = new BrowserBackend(_options);

    // This is a workaround for now using fetch on RN, this is a known issue in react-native and only generates a warning
    // YellowBox deprecated and replaced with with LogBox in RN 0.63
    if (LogBox) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      LogBox.ignoreLogs(["Require cycle:"]);
    } else {
      // eslint-disable-next-line deprecation/deprecation
      YellowBox.ignoreWarnings(["Require cycle:"]);
    }

    void this._initNativeSdk();
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
  public eventFromException(
    exception: unknown,
    hint?: EventHint
  ): PromiseLike<Event> {
    return this._browserBackend.eventFromException(exception, hint);
  }

  /**
   * @inheritDoc
   */
  public eventFromMessage(
    message: string,
    level: Severity = Severity.Info,
    hint?: EventHint
  ): PromiseLike<Event> {
    return this._browserBackend.eventFromMessage(message, level, hint);
  }

  /**
   * @inheritDoc
   */
  protected _setupTransport(): Transport {
    if (!this._options.dsn) {
      // We return the noop transport here in case there is no Dsn.
      return new NoopTransport();
    }

    const transportOptions = {
      ...this._options.transportOptions,
      dsn: this._options.dsn,
    };

    if (this._options.transport) {
      return new this._options.transport(transportOptions);
    }

    if (NATIVE.isNativeTransportAvailable()) {
      return new NativeTransport();
    }

    return new Transports.FetchTransport(transportOptions);
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

    const reactNativeTracing = getCurrentHub().getIntegration(
      ReactNativeTracing
    );

    if (reactNativeTracing) {
      void reactNativeTracing.logAppStart();
    }

    this._options.onReady?.({ didCallNativeInit });
  }

  /**
   * If the user is in development mode, and the native nagger is enabled then it will show an alert.
   */
  private _showCannotConnectDialog(): void {
    if (__DEV__ && this._options.enableNativeNagger) {
      Alert.alert(
        "Sentry",
        "Warning, could not connect to Sentry native SDK.\nIf you do not want to use the native component please pass `enableNative: false` in the options.\nVisit: https://docs.sentry.io/platforms/react-native/#linking for more details."
      );
    }
  }
}
