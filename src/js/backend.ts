import { BrowserBackend } from "@sentry/browser/dist/backend";
import { BaseBackend, NoopTransport } from "@sentry/core";
import { BrowserOptions, Transports } from "@sentry/react";
import { Event, EventHint, Severity, Transport } from "@sentry/types";
// @ts-ignore LogBox introduced in RN 0.63
import { Alert, LogBox, YellowBox } from "react-native";

import { ReactNativeOptions } from "./options";
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

    void this._startWithOptions();
  }

  /**
   * If native client is available it will trigger a native crash.
   * Use this only for testing purposes.
   */
  public nativeCrash(): void {
    if (this._options.enableNative) {
      NATIVE.crash();
    }
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

    if (this._isNativeTransportAvailable()) {
      return new NativeTransport();
    }

    return new Transports.FetchTransport(transportOptions);
  }

  /**
   * If true, native client is availabe and active
   */
  private _isNativeTransportAvailable(): boolean {
    return (
      this._options.enableNative === true &&
      NATIVE.isNativeClientAvailable() &&
      NATIVE.isNativeTransportAvailable()
    );
  }

  /**
   * Starts native client with dsn and options
   */
  private async _startWithOptions(): Promise<void> {
    try {
      await NATIVE.startWithOptions(this._options);
      NATIVE.setLogLevel(this._options.debug ? 2 : 1);
    } catch (_) {
      this._showCannotConnectDialog();
    }
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
