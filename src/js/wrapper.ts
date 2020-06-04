import { Breadcrumb, Event, Response, User } from "@sentry/types";
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

    // separate and serialze all non-default user keys.
    let defaultUserKeys = null;
    let otherUserKeys = null;
    if (user) {
      const { id, ip_address, email, username, ...otherKeys } = user;
      defaultUserKeys = {
        email,
        id,
        ip_address,
        username
      };
      otherUserKeys = this._serializeObject(otherKeys);
    }

    // tslint:disable-next-line: no-unsafe-any
    return RNSentry.setUser(defaultUserKeys, otherUserKeys);
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

    const stringifiedValue =
      // tslint:disable-next-line: strict-type-predicates
      typeof value === "string" ? value : JSON.stringify(value);

    // tslint:disable-next-line: no-unsafe-any
    return RNSentry.setTag(key, stringifiedValue);
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

    // tslint:disable-next-line: no-unsafe-any
    return RNSentry.addBreadcrumb({
      ...breadcrumb,
      data: breadcrumb.data ? this._serializeObject(breadcrumb.data) : undefined
    });
  },

  /**
   * Clears breadcrumsb on the native scope.
   */
  clearBreadcrumbs(): void {
    if (!this.isNativeClientAvailable()) {
      throw this._NativeClientError;
    }

    // tslint:disable-next-line: no-unsafe-any
    return RNSentry.clearBreadcrumbs();
  },

  /**
   * Sets context on the native scope. Not implemented in Android yet.
   * @param key string
   * @param context key-value map
   */
  setContext(key: string, context: { [key: string]: any } | null): void {
    if (!this.isNativeClientAvailable()) {
      throw this._NativeClientError;
    }

    if (this.platform === "android") {
      // setContext not available on the Android SDK yet.
      this.setExtra(key, context);
    } else {
      // tslint:disable-next-line: no-unsafe-any
      RNSentry.setContext(
        key,
        context !== null ? this._serializeObject(context) : null
      );
    }
  },

  /**
   * Serializes all values of root-level keys into strings.
   * @param data key-value map.
   * @returns An object where all root-level values are strings.
   */
  _serializeObject(data: { [key: string]: any }): { [key: string]: string } {
    const serialized: { [key: string]: any } = {};

    Object.keys(data).forEach((dataKey) => {
      const value = data[dataKey];
      serialized[dataKey] =
        typeof value === "string" ? value : JSON.stringify(value);
    });

    return serialized;
  },

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
