/* eslint-disable max-lines */
import {
  AttachmentItem,
  BaseEnvelopeItemHeaders,
  Breadcrumb,
  ClientReportItem,
  Envelope,
  Event,
  EventItem,
  Package,
  SessionItem,
  SeverityLevel,
  User,
  UserFeedbackItem,
} from '@sentry/types';
import { logger, SentryError } from '@sentry/utils';
import { NativeModules, Platform } from 'react-native';

import {
  NativeAppStartResponse,
  NativeDeviceContextsResponse,
  NativeFramesResponse,
  NativeReleaseResponse,
  SentryNativeBridgeModule,
} from './definitions';
import { ReactNativeOptions } from './options';
import { utf8ToBytes } from './vendor';

type Item = EventItem | AttachmentItem | UserFeedbackItem | SessionItem | ClientReportItem;

const RNSentry = NativeModules.RNSentry as SentryNativeBridgeModule | undefined;

interface SentryNativeWrapper {
  enableNative: boolean;
  nativeIsReady: boolean;
  platform: typeof Platform.OS;

  _NativeClientError: Error;
  _DisabledNativeError: Error;

  _processItem(envelopeItem: Item): Item;
  _processLevels(event: Event): Event;
  _processLevel(level: SeverityLevel): SeverityLevel;
  _serializeObject(data: { [key: string]: unknown }): { [key: string]: string };
  _isModuleLoaded(
    module: SentryNativeBridgeModule | undefined
  ): module is SentryNativeBridgeModule;
  _getBreadcrumbs(event: Event): Breadcrumb[];

  isNativeTransportAvailable(): boolean;

  initNativeSdk(options: ReactNativeOptions): PromiseLike<boolean>;
  closeNativeSdk(): PromiseLike<void>;

  sendEnvelope(envelope: Envelope): Promise<void>;

  fetchNativeRelease(): PromiseLike<NativeReleaseResponse>;
  fetchNativeDeviceContexts(): PromiseLike<NativeDeviceContextsResponse>;
  fetchNativeAppStart(): PromiseLike<NativeAppStartResponse | null>;
  fetchNativeFrames(): PromiseLike<NativeFramesResponse | null>;
  fetchNativeSdkInfo(): PromiseLike<Package | null>;

  disableNativeFramesTracking(): void;

  addBreadcrumb(breadcrumb: Breadcrumb): void;
  setContext(key: string, context: { [key: string]: unknown } | null): void;
  clearBreadcrumbs(): void;
  setExtra(key: string, extra: unknown): void;
  setUser(user: User | null): void;
  setTag(key: string, value: string): void;

  nativeCrash(): void;
}

/**
 * Our internal interface for calling native functions
 */
export const NATIVE: SentryNativeWrapper = {
  /**
   * Sending the envelope over the bridge to native
   * @param envelope Envelope
   */
  async sendEnvelope(envelope: Envelope): Promise<void> {
    if (!this.enableNative) {
      logger.warn('Event was skipped as native SDK is not enabled.');
      return;
    }

    if (!this._isModuleLoaded(RNSentry)) {
      throw this._NativeClientError;
    }

    const [envelopeHeader, envelopeItems] = envelope;

    const headerString = JSON.stringify(envelopeHeader);
    const envelopeBuilder: number[] = utf8ToBytes(headerString);

    for (const rawItem of envelopeItems) {
      const [itemHeader, itemPayload] = this._processItem(rawItem);

      let bytesPayload: number[] = [];
      if (typeof itemPayload === 'string') {
        bytesPayload = utf8ToBytes(itemPayload);
      } else if (itemPayload instanceof Uint8Array) {
        bytesPayload = [...itemPayload];
      } else {
        bytesPayload = utf8ToBytes(JSON.stringify(itemPayload));
      }

      // Content type is not inside BaseEnvelopeItemHeaders.
      (itemHeader as BaseEnvelopeItemHeaders).content_type = 'application/json';
      (itemHeader as BaseEnvelopeItemHeaders).length = bytesPayload.length;
      const serializedItemHeader = JSON.stringify(itemHeader);
      envelopeBuilder.concat(utf8ToBytes(serializedItemHeader));

      envelopeBuilder.concat(bytesPayload);
    }

    await RNSentry.captureEnvelope(envelopeBuilder);
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
        logger.warn('Note: Native Sentry SDK is disabled.');
      }
      this.enableNative = false;
      return false;
    }
    if (!options.autoInitializeNativeSdk) {
      if (options.enableNativeNagger) {
        logger.warn(
          'Note: Native Sentry SDK was not initialized automatically, you will need to initialize it manually. If you wish to disable the native SDK and get rid of this warning, pass enableNative: false'
        );
      }
      return false;
    }

    if (!options.dsn) {
      logger.warn(
        'Warning: No DSN was provided. The Sentry SDK will be disabled. Native SDK will also not be initalized.'
      );
      return false;
    }

    if (!this._isModuleLoaded(RNSentry)) {
      throw this._NativeClientError;
    }

    // filter out all the options that would crash native.
    /* eslint-disable @typescript-eslint/unbound-method,@typescript-eslint/no-unused-vars */
    const {
      beforeSend,
      beforeBreadcrumb,
      integrations,
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
   * Fetches the Sdk info for the native sdk.
   * NOTE: Only available on iOS.
   */
  async fetchNativeSdkInfo(): Promise<Package | null> {
    if (!this.enableNative) {
      throw this._DisabledNativeError;
    }
    if (!this._isModuleLoaded(RNSentry)) {
      throw this._NativeClientError;
    }

    if (this.platform !== 'ios') {
      return null;
    }

    return RNSentry.fetchNativeSdkInfo();
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

    if (this.platform !== 'ios') {
      // Only ios uses deviceContexts, return an empty object.
      return {};
    }

    return RNSentry.fetchNativeDeviceContexts();
  },

  async fetchNativeAppStart(): Promise<NativeAppStartResponse | null> {
    if (!this.enableNative) {
      throw this._DisabledNativeError;
    }
    if (!this._isModuleLoaded(RNSentry)) {
      throw this._NativeClientError;
    }

    return RNSentry.fetchNativeAppStart();
  },

  async fetchNativeFrames(): Promise<NativeFramesResponse | null> {
    if (!this.enableNative) {
      throw this._DisabledNativeError;
    }
    if (!this._isModuleLoaded(RNSentry)) {
      throw this._NativeClientError;
    }

    return RNSentry.fetchNativeFrames();
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
      typeof value === 'string' ? value : JSON.stringify(value);

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
      typeof extra === 'string' ? extra : JSON.stringify(extra);

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

    RNSentry.setContext(
      key,
      context !== null ? this._serializeObject(context) : null
    );
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

  disableNativeFramesTracking(): void {
    if (!this.enableNative) {
      return;
    }
    if (!this._isModuleLoaded(RNSentry)) {
      return;
    }

    RNSentry.disableNativeFramesTracking();
  },

  isNativeTransportAvailable(): boolean {
    return this.enableNative && this._isModuleLoaded(RNSentry);
  },

  /**
   * Gets the event from envelopeItem and applies the level filter to the selected event.
   * @param data An envelope item containing the event.
   * @returns The event from envelopeItem or undefined.
   */
  _processItem(item: Item): Item {
    const [itemHeader, itemPayload] = item;

    if (itemHeader.type == 'event' || itemHeader.type == 'transaction') {
      const event = this._processLevels(itemPayload as Event);

      if (NATIVE.platform === 'android') {
        // @ts-ignore Android still uses the old message object, without this the serialization of events will break.
        event.message = { message: event.message };
        event.breadcrumbs = this._getBreadcrumbs(event);
      }

      return [itemHeader, event];
    }

    return item;
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
        typeof value === 'string' ? value : JSON.stringify(value);
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

  _processLevel(level: SeverityLevel): SeverityLevel {
    if (level == 'log' as SeverityLevel) {
      return 'debug' as SeverityLevel;
    }
    else if (level == 'critical' as SeverityLevel) {
      return 'fatal' as SeverityLevel;
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

  _DisabledNativeError: new SentryError('Native is disabled'),

  _NativeClientError: new SentryError(
    "Native Client is not available, can't start on native."
  ),

  /**
   * Get breadcrumbs (removes breadcrumbs from handled exceptions on Android)
   *
   * We do this to avoid duplicate breadcrumbs on Android as sentry-android applies the breadcrumbs
   * from the native scope onto every envelope sent through it. This scope will contain the breadcrumbs
   * sent through the scope sync feature. This causes duplicate breadcrumbs.
   * We then remove the breadcrumbs in all cases but if it is handled == false,
   * this is a signal that the app would crash and android would lose the breadcrumbs by the time the app is restarted to read
   * the envelope.
   */
  _getBreadcrumbs(event: Event): Breadcrumb[] {
    let breadcrumbs: Breadcrumb[] | undefined = event.breadcrumbs;

    const wasExceptionHandled: boolean = event.exception?.values?.[0]?.mechanism?.handled != false;
    if (NATIVE.platform === 'android'
      && event.breadcrumbs
      && wasExceptionHandled) {
      breadcrumbs = [];
    }

    return breadcrumbs || [];
  },

  enableNative: true,
  nativeIsReady: false,
  platform: Platform.OS,
};
