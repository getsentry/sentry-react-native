import { BrowserOptions, Transports } from "@sentry/browser";
import { BrowserBackend } from "@sentry/browser/dist/backend";
import { BaseBackend, NoopTransport } from "@sentry/core";
import { Event, EventHint, Severity, Transport } from "@sentry/types";
import { Alert, NativeModules, YellowBox } from "react-native";

import { NativeTransport } from "./transports/native";
import { NATIVE } from "./wrapper";

const { RNSentry } = NativeModules;

/**
 * Configuration options for the Sentry ReactNative SDK.
 * @see ReactNativeFrontend for more information.
 */
export interface ReactNativeOptions extends BrowserOptions {
  /**
   * Enables native transport + device info + offline caching.
   * Be careful, disabling this also breaks automatic release setting.
   * This means you have to manage setting the release yourself.
   * Defaults to `true`.
   */
  enableNative?: boolean;

  /**
   * Enables native crashHandling. This only works if `enableNative` is `true`.
   * Defaults to `true`.
   */
  enableNativeCrashHandling?: boolean;

  /** Maximum time to wait to drain the request queue, before the process is allowed to exit. */
  shutdownTimeout?: number;

  /** Should the native nagger alert be shown or not. */
  enableNativeNagger?: boolean;
}

/** The Sentry ReactNative SDK Backend. */
export class ReactNativeBackend extends BaseBackend<BrowserOptions> {
  private readonly _browserBackend: BrowserBackend;

  /** Creates a new ReactNative backend instance. */
  public constructor(protected readonly _options: ReactNativeOptions) {
    super(_options);
    this._browserBackend = new BrowserBackend(_options);

    // This is a workaround for now using fetch on RN, this is a known issue in react-native and only generates a warning
    YellowBox.ignoreWarnings(["Require cycle:"]);

    // tslint:disable: no-unsafe-any
    if (
      RNSentry &&
      RNSentry.nativeClientAvailable &&
      _options.enableNative !== false
    ) {
      RNSentry.startWithDsnString(_options.dsn, _options).then(() => {
        RNSentry.setLogLevel(_options.debug ? 2 : 1);
      });
    } else {
      if (__DEV__ && _options.enableNativeNagger) {
        Alert.alert(
          "Sentry",
          "Warning, could not connect to Sentry native SDK.\nIf you do not want to use the native component please pass `enableNative: false` in the options.\nVisit: https://docs.sentry.io/platforms/react-native/#linking for more details."
        );
      }
    }
    // tslint:enable: no-unsafe-any
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
      dsn: this._options.dsn
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
    // tslint:disable: no-unsafe-any
    return (
      this._options.enableNative &&
      RNSentry &&
      RNSentry.nativeClientAvailable &&
      RNSentry.nativeTransport
    );
    // tslint:enable: no-unsafe-any
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
    exception: any,
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
}
