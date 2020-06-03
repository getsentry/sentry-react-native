import { Event, Response, User, Breadcrumb } from "@sentry/types";
import { SentryError } from "@sentry/utils";
import { NativeModules, Platform } from "react-native";

import { ReactNativeOptions } from "./backend";

const { RNSentry } = NativeModules;

/**
 * Our internal interface for calling native functions
 */
export const NATIVE = {
  /**
   * Sending the event over the bridge to native
   * @param event Event
   */
  async sendEvent(event: Event): Promise<Response> {
    if (!this.isNativeClientAvailable()) {
      throw this._NativeClientError;
    }

    if (NATIVE.platform === "android") {
      const header = JSON.stringify({ event_id: event.event_id });

      (event as any).message = {
        message: event.message
      };
      const payload = JSON.stringify(event);
      let length = payload.length;
      try {
        // tslint:disable-next-line: no-unsafe-any
        length = await RNSentry.getStringBytesLength(payload);
      } catch {
        // The native call failed, we do nothing, we have payload.length as a fallback
      }
      const item = JSON.stringify({
        content_type: "application/json",
        length,
        type: "event"
      });
      const envelope = `${header}\n${item}\n${payload}`;
      // tslint:disable-next-line: no-unsafe-any
      return RNSentry.captureEnvelope(envelope);
    }
    // tslint:disable-next-line: no-unsafe-any
    return RNSentry.sendEvent(event);
  },

  /**
   * Starts native with the provided options.
   * @param options ReactNativeOptions
   */
  async startWithOptions(options: ReactNativeOptions = {}): Promise<boolean> {
    if (!this.isNativeClientAvailable()) {
      throw this._NativeClientError;
    }

    if (__DEV__ && !options.dsn) {
      console.warn(
        "Warning: No DSN was provided. The Sentry SDK will be disabled."
      );
    }

    // filter out all the options that would crash native.
    const {
      beforeSend,
      beforeBreadcrumb,
      integrations,
      defaultIntegrations,
      transport,
      ...filteredOptions
    } = options;

    // tslint:disable-next-line: no-unsafe-any
    return RNSentry.startWithOptions(filteredOptions);
  },

  /**
   * Fetches the release from native
   */
  async fetchRelease(): Promise<{
    build: string;
    id: string;
    version: string;
  }> {
    if (!this.isNativeClientAvailable()) {
      throw this._NativeClientError;
    }
    // tslint:disable-next-line: no-unsafe-any
    return RNSentry.fetchRelease();
  },

  /**
   * Fetches the device contexts. Not used on Android.
   */
  async deviceContexts(): Promise<object> {
    if (!this.isNativeClientAvailable()) {
      throw this._NativeClientError;
    }
    // tslint:disable-next-line: no-unsafe-any
    return RNSentry.deviceContexts();
  },

  /**
   * Sets log level in native
   * @param level number
   */
  setLogLevel(level: number): void {
    if (!this.isNativeClientAvailable()) {
      throw this._NativeClientError;
    }
    // tslint:disable-next-line: no-unsafe-any
    return RNSentry.setLogLevel(level);
  },

  /**
   * Triggers a native crash.
   * Use this only for testing purposes.
   */
  crash(): void {
    if (!this.isNativeClientAvailable()) {
      throw this._NativeClientError;
    }
    // tslint:disable-next-line: no-unsafe-any
    return RNSentry.crash();
  },

  /**
   * Sets the user in the native scope.
   * Passing null clears the user.
   * @param key string
   * @param value string
   */
  setUser(user: User | null): void {
    if (!this.isNativeClientAvailable()) {
      throw this._NativeClientError;
    }
    // tslint:disable-next-line: no-unsafe-any
    return RNSentry.setUser(user);
  },

  /**
   * Sets a tag in the native module.
   * @param key string
   * @param value string
   */
  setTag(key: string, value: string): void {
    if (!this.isNativeClientAvailable()) {
      throw this._NativeClientError;
    }
    // tslint:disable-next-line: no-unsafe-any
    return RNSentry.setTag(key, value);
  },

  /**
   * Sets an extra in the native scope, will stringify
   * extra value if it isn't already a string.
   * @param key string
   * @param extra any
   */
  setExtra(key: string, extra: any): void {
    if (!this.isNativeClientAvailable()) {
      throw this._NativeClientError;
    }

    // we stringify the extra as native only takes in strings.
    const stringifiedExtra =
      typeof extra === "string" ? extra : JSON.stringify(extra);

    // tslint:disable-next-line: no-unsafe-any
    return RNSentry.setExtra(key, stringifiedExtra);
  },

  /**
   * Adds breadcrumb to the native scope.
   * @param breadcrumb Breadcrumb
   */
  addBreadcrumb(breadcrumb: Breadcrumb): void {
    if (!this.isNativeClientAvailable()) {
      throw this._NativeClientError;
    }

    const stringifiedData: { [key: string]: any } = {};
    if (typeof breadcrumb.data !== "undefined") {
      Object.keys(breadcrumb.data).forEach((dataKey) => {
        if (typeof breadcrumb.data !== "undefined") {
          const value = breadcrumb.data[dataKey];
          stringifiedData[dataKey] =
            typeof value === "string" ? value : JSON.stringify(value);
        }
      });
    }

    // tslint:disable-next-line: no-unsafe-any
    return RNSentry.addBreadcrumb({
      ...breadcrumb,
      data: stringifiedData
    });
  },

  // /**
  //  *
  //  * @param fingerprint string[]
  //  */
  // setFingerprint(fingerprint: string[]): void {
  //   if (!this.isNativeClientAvailable()) {
  //     throw this._NativeClientError;
  //   }

  //   // tslint:disable-next-line: no-unsafe-any
  //   return RNSentry.setFingerprint(fingerprint);
  // },

  /**
   * Checks whether the RNSentry module is loaded.
   */
  isModuleLoaded(): boolean {
    return !!RNSentry;
  },

  /**
   *  Checks whether the RNSentry module is loaded and the native client is available
   */
  isNativeClientAvailable(): boolean {
    // tslint:disable-next-line: no-unsafe-any
    return this.isModuleLoaded() && RNSentry.nativeClientAvailable;
  },

  /**
   *  Checks whether the RNSentry module is loaded and native transport is available
   */
  isNativeTransportAvailable(): boolean {
    // tslint:disable-next-line: no-unsafe-any
    return this.isModuleLoaded() && RNSentry.nativeTransport;
  },

  _NativeClientError: new SentryError(
    "Native Client is not available, can't start on native."
  ),

  platform: Platform.OS
};
