/* eslint-disable max-lines */
import {
  Breadcrumb,
  Event,
  Response,
  Severity,
  Status,
  User,
} from "@sentry/types";
import { logger, SentryError } from "@sentry/utils";
import { NativeEventEmitter, NativeModules, Platform } from "react-native";

import {
  NativeAppStartResponse,
  NativeDeviceContextsResponse,
  NativeReleaseResponse,
  SentryNativeBridgeModule,
} from "./definitions";
import { ReactNativeOptions } from "./options";

const RNSentry = NativeModules.RNSentry as SentryNativeBridgeModule | undefined;

interface SentryNativeWrapper {
  enableNative: boolean;
  nativeIsReady: boolean;
  platform: typeof Platform.OS;

  _NativeClientError: Error;
  _DisabledNativeError: Error;

  _processLevels(event: Event): Event;
  _processLevel(level: Severity): Severity;
  _serializeObject(data: { [key: string]: unknown }): { [key: string]: string };
  _isModuleLoaded(
    module: SentryNativeBridgeModule | undefined
  ): module is SentryNativeBridgeModule;

  isNativeTransportAvailable(): boolean;

  initNativeSdk(options: ReactNativeOptions): PromiseLike<boolean>;
  closeNativeSdk(): PromiseLike<void>;

  sendEvent(event: Event): PromiseLike<Response>;

  fetchNativeRelease(): PromiseLike<NativeReleaseResponse>;
  fetchNativeDeviceContexts(): PromiseLike<NativeDeviceContextsResponse>;

  addBreadcrumb(breadcrumb: Breadcrumb): void;
  setContext(key: string, context: { [key: string]: unknown } | null): void;
  clearBreadcrumbs(): void;
  setExtra(key: string, extra: unknown): void;
  setUser(user: User | null): void;
  setTag(key: string, value: string): void;

  nativeCrash(): void;
}

const eventEmitter = new NativeEventEmitter(NativeModules.RNSentry);

interface SentryNativeWrapper {
  enableNative: boolean;
  platform: typeof Platform.OS;

  _appStart: NativeAppStartResponse;
  _NativeClientError: Error;
  _DisabledNativeError: Error;

  _appStartCallback: ((appStart: NativeAppStartResponse) => void) | undefined;

  _processLevels(event: Event): Event;
  _processLevel(level: Severity): Severity;
  _serializeObject(data: { [key: string]: unknown }): { [key: string]: string };
  _addAppStartTimeListener(): void;

  isNativeClientAvailable(): boolean;
  getAppStartTime(callback: (appStart: NativeAppStartResponse) => void): void;
  setExtra(key: string, extra: unknown): void;
}

/**
 * Our internal interface for calling native functions
 */
export const NATIVE: SentryNativeWrapper = {
  /**
   * Sending the event over the bridge to native
   * @param event Event
   */
  async sendEvent(_event: Event): Promise<Response> {
    if (!this.enableNative) {
      return {
        reason: `Event was skipped as native SDK is not enabled.`,
        status: Status.Skipped,
      };
    }

    if (!this._isModuleLoaded(RNSentry)) {
      throw this._NativeClientError;
    }

    const event = this._processLevels(_event);

    const header = {
      event_id: event.event_id,
      sdk: event.sdk,
    };

    let envelopeWasSent = false;
    if (NATIVE.platform === "android") {
      // Android

      const headerString = JSON.stringify(header);

      /*
        We do this to avoid duplicate breadcrumbs on Android as sentry-android applies the breadcrumbs
        from the native scope onto every envelope sent through it. This scope will contain the breadcrumbs
        sent through the scope sync feature. This causes duplicate breadcrumbs.
        We then remove the breadcrumbs here but only when mechanism.handled is true. If it is handled == false,
        this is a signal that the app would crash and android would lose the breadcrumbs by the time the app is restarted to read
        the envelope.
      */
      if (event.exception?.values?.[0]?.mechanism?.handled) {
        event.breadcrumbs = [];
      }

      const payload = {
        ...event,
        message: {
          message: event.message,
        },
      };

      const payloadString = JSON.stringify(payload);
      let length = payloadString.length;
      try {
        length = await RNSentry.getStringBytesLength(payloadString);
      } catch {
        // The native call failed, we do nothing, we have payload.length as a fallback
      }

      const item = {
        content_type: "application/json",
        length,
        type: payload.type ?? "event",
      };

      const itemString = JSON.stringify(item);

      const envelopeString = `${headerString}\n${itemString}\n${payloadString}`;

      envelopeWasSent = await RNSentry.captureEnvelope(envelopeString);
    } else {
      // iOS/Mac

      const payload = {
        ...event,
        message: {
          message: event.message,
        },
      };

      // Serialize and remove any instances that will crash the native bridge such as Spans
      const serializedPayload = JSON.parse(JSON.stringify(payload));

      // The envelope item is created (and its length determined) on the iOS side of the native bridge.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      envelopeWasSent = await RNSentry.captureEnvelope({
        header,
        payload: serializedPayload,
      });
    }

    if (envelopeWasSent) {
      return {
        status: Status.Success,
      };
    }

    return {
      status: Status.Failed,
    };
  },

  /**
   * Starts native with the provided options.
   * @param options ReactNativeOptions
   */
  async initNativeSdk(originalOptions: ReactNativeOptions): Promise<boolean> {
    const options = {
      enableNative: true,
      autoInitializeNativeSdk: true,
      ...originalOptions,
    };

    if (!options.enableNative) {
      if (options.enableNativeNagger) {
        logger.warn("Note: Native Sentry SDK is disabled.");
      }
      this.enableNative = false;
      return false;
    }
    if (!options.autoInitializeNativeSdk) {
      if (options.enableNativeNagger) {
        logger.warn(
          "Note: Native Sentry SDK was not initialized automatically, you will need to initialize it manually. If you wish to disable the native SDK and get rid of this warning, pass enableNative: false"
        );
      }
      return false;
    }

    if (!options.dsn) {
      logger.warn(
        "Warning: No DSN was provided. The Sentry SDK will be disabled. Native SDK will also not be initalized."
      );
      return false;
    }

    if (!this._isModuleLoaded(RNSentry)) {
      throw this._NativeClientError;
    }

    this._addAppStartTimeListener();

    // filter out all the options that would crash native.
    /* eslint-disable @typescript-eslint/unbound-method,@typescript-eslint/no-unused-vars */
    const {
      beforeSend,
      beforeBreadcrumb,
      integrations,
      defaultIntegrations,
      transport,
      ...filteredOptions
    } = options;
    /* eslint-enable @typescript-eslint/unbound-method,@typescript-eslint/no-unused-vars */

    const nativeIsReady = await RNSentry.initNativeSdk(filteredOptions);

    this.nativeIsReady = nativeIsReady;

    return nativeIsReady;
  },

  /**
   * Fetches the release from native
   */
  async fetchNativeRelease(): Promise<NativeReleaseResponse> {
    if (!this.enableNative) {
      throw this._DisabledNativeError;
    }
    if (!this._isModuleLoaded(RNSentry)) {
      throw this._NativeClientError;
    }

    return RNSentry.fetchNativeRelease();
  },

  /**
   * Fetches the device contexts. Not used on Android.
   */
  async fetchNativeDeviceContexts(): Promise<NativeDeviceContextsResponse> {
    if (!this.enableNative) {
      throw this._DisabledNativeError;
    }
    if (!this._isModuleLoaded(RNSentry)) {
      throw this._NativeClientError;
    }

    if (this.platform !== "ios") {
      // Only ios uses deviceContexts, return an empty object.
      return {};
    }

    return RNSentry.fetchNativeDeviceContexts();
  },

  getAppStartTime(callback: (appStart: NativeAppStartResponse) => void): void {
    if (this._appStart) {
      callback(this._appStart);
    } else {
      this._appStartCallback = callback;
    }
  },

  _addAppStartTimeListener(): void {
    if (!this.enableNative) {
      throw this._DisabledNativeError;
    }
    if (!this.isNativeClientAvailable()) {
      throw this._NativeClientError;
    }

    eventEmitter.addListener("RNSentryAppStartMeasurements", (event) => {
      this._appStart = event;

      this._appStartCallback?.(event);

      eventEmitter.removeCurrentListener();
    });
  },

  /**
   * Triggers a native crash.
   * Use this only for testing purposes.
   */
  nativeCrash(): void {
    if (!this.enableNative) {
      return;
    }
    if (!this._isModuleLoaded(RNSentry)) {
      throw this._NativeClientError;
    }

    RNSentry.crash();
  },

  /**
   * Sets the user in the native scope.
   * Passing null clears the user.
   */
  setUser(user: User | null): void {
    if (!this.enableNative) {
      return;
    }
    if (!this._isModuleLoaded(RNSentry)) {
      throw this._NativeClientError;
    }

    // separate and serialze all non-default user keys.
    let defaultUserKeys = null;
    let otherUserKeys = null;
    if (user) {
      const { id, ip_address, email, username, ...otherKeys } = user;
      defaultUserKeys = this._serializeObject({
        email,
        id,
        ip_address,
        username,
      });
      otherUserKeys = this._serializeObject(otherKeys);
    }

    RNSentry.setUser(defaultUserKeys, otherUserKeys);
  },

  /**
   * Sets a tag in the native module.
   * @param key string
   * @param value string
   */
  setTag(key: string, value: string): void {
    if (!this.enableNative) {
      return;
    }
    if (!this._isModuleLoaded(RNSentry)) {
      throw this._NativeClientError;
    }

    const stringifiedValue =
      typeof value === "string" ? value : JSON.stringify(value);

    RNSentry.setTag(key, stringifiedValue);
  },

  /**
   * Sets an extra in the native scope, will stringify
   * extra value if it isn't already a string.
   * @param key string
   * @param extra any
   */
  setExtra(key: string, extra: unknown): void {
    if (!this.enableNative) {
      return;
    }
    if (!this._isModuleLoaded(RNSentry)) {
      throw this._NativeClientError;
    }

    // we stringify the extra as native only takes in strings.
    const stringifiedExtra =
      typeof extra === "string" ? extra : JSON.stringify(extra);

    RNSentry.setExtra(key, stringifiedExtra);
  },

  /**
   * Adds breadcrumb to the native scope.
   * @param breadcrumb Breadcrumb
   */
  addBreadcrumb(breadcrumb: Breadcrumb): void {
    if (!this.enableNative) {
      return;
    }
    if (!this._isModuleLoaded(RNSentry)) {
      throw this._NativeClientError;
    }

    RNSentry.addBreadcrumb({
      ...breadcrumb,
      // Process and convert deprecated levels
      level: breadcrumb.level
        ? this._processLevel(breadcrumb.level)
        : undefined,
      data: breadcrumb.data
        ? this._serializeObject(breadcrumb.data)
        : undefined,
    });
  },

  /**
   * Clears breadcrumbs on the native scope.
   */
  clearBreadcrumbs(): void {
    if (!this.enableNative) {
      return;
    }
    if (!this._isModuleLoaded(RNSentry)) {
      throw this._NativeClientError;
    }

    RNSentry.clearBreadcrumbs();
  },

  /**
   * Sets context on the native scope. Not implemented in Android yet.
   * @param key string
   * @param context key-value map
   */
  setContext(key: string, context: { [key: string]: unknown } | null): void {
    if (!this.enableNative) {
      return;
    }
    if (!this._isModuleLoaded(RNSentry)) {
      throw this._NativeClientError;
    }

    if (this.platform === "android") {
      // setContext not available on the Android SDK yet.
      this.setExtra(key, context);
    } else {
      RNSentry.setContext(
        key,
        context !== null ? this._serializeObject(context) : null
      );
    }
  },

  /**
   * Closes the Native Layer SDK
   */
  async closeNativeSdk(): Promise<void> {
    if (!this.enableNative) {
      return;
    }
    if (!this._isModuleLoaded(RNSentry)) {
      return;
    }

    return RNSentry.closeNativeSdk().then(() => {
      this.enableNative = false;
    });
  },

  isNativeTransportAvailable(): boolean {
    return this.enableNative && this._isModuleLoaded(RNSentry);
  },

  /**
   * Serializes all values of root-level keys into strings.
   * @param data key-value map.
   * @returns An object where all root-level values are strings.
   */
  _serializeObject(data: {
    [key: string]: unknown;
  }): { [key: string]: string } {
    const serialized: { [key: string]: string } = {};

    Object.keys(data).forEach((dataKey) => {
      const value = data[dataKey];
      serialized[dataKey] =
        typeof value === "string" ? value : JSON.stringify(value);
    });

    return serialized;
  },

  /**
   * Convert js severity level in event.level and event.breadcrumbs to more widely supported levels.
   * @param event
   * @returns Event with more widely supported Severity level strings
   */
  _processLevels(event: Event): Event {
    const processed: Event = {
      ...event,
      level: event.level ? this._processLevel(event.level) : undefined,
      breadcrumbs: event.breadcrumbs?.map((breadcrumb) => ({
        ...breadcrumb,
        level: breadcrumb.level
          ? this._processLevel(breadcrumb.level)
          : undefined,
      })),
    };

    return processed;
  },

  /**
   * Convert js severity level which has critical and log to more widely supported levels.
   * @param level
   * @returns More widely supported Severity level strings
   */
  _processLevel(level: Severity): Severity {
    if (level === Severity.Critical) {
      return Severity.Fatal;
    }
    if (level === Severity.Log) {
      return Severity.Debug;
    }

    return level;
  },

  /**
   * Checks whether the RNSentry module is loaded.
   */
  _isModuleLoaded(
    module: SentryNativeBridgeModule | undefined
  ): module is SentryNativeBridgeModule {
    return !!module;
  },

  _DisabledNativeError: new SentryError("Native is disabled"),

  _NativeClientError: new SentryError(
    "Native Client is not available, can't start on native."
  ),

  _appStart: null,

  enableNative: true,
  nativeIsReady: false,
  platform: Platform.OS,
};
