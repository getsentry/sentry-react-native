import { Event, Response } from "@sentry/types";
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

    // tslint:disable-next-line: no-unsafe-any
    return RNSentry.startWithOptions(options);
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
