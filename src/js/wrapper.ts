/* eslint-disable max-lines */
import type {
  BaseEnvelopeItemHeaders,
  Breadcrumb,
  Envelope,
  EnvelopeItem,
  Event,
  Package,
  SeverityLevel,
  User,
} from '@sentry/types';
import { logger, normalize, SentryError } from '@sentry/utils';
import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';

import { isHardCrash } from './misc';
import type {
  NativeAppStartResponse,
  NativeDeviceContextsResponse,
  NativeFramesResponse,
  NativeReleaseResponse,
  NativeScreenshot,
  NativeStackFrames,
  Spec,
} from './NativeRNSentry';
import type { ReactNativeClientOptions } from './options';
import type * as Hermes from './profiling/hermes';
import type { NativeProfileEvent } from './profiling/nativeTypes';
import type { RequiredKeysUser } from './user';
import { isTurboModuleEnabled } from './utils/environment';
import { utf8ToBytes } from './vendor';

const RNSentry: Spec | undefined = isTurboModuleEnabled()
  ? TurboModuleRegistry.get<Spec>('RNSentry')
  : NativeModules.RNSentry;

export interface Screenshot {
  data: Uint8Array;
  contentType: string;
  filename: string;
}

interface SentryNativeWrapper {
  enableNative: boolean;
  nativeIsReady: boolean;
  platform: typeof Platform.OS;

  _NativeClientError: Error;
  _DisabledNativeError: Error;

  _processItem(envelopeItem: EnvelopeItem): EnvelopeItem;
  _processLevels(event: Event): Event;
  _processLevel(level: SeverityLevel): SeverityLevel;
  _serializeObject(data: { [key: string]: unknown }): { [key: string]: string };
  _isModuleLoaded(module: Spec | undefined): module is Spec;

  isNativeAvailable(): boolean;

  initNativeSdk(options: Partial<ReactNativeClientOptions>): PromiseLike<boolean>;
  closeNativeSdk(): PromiseLike<void>;

  sendEnvelope(envelope: Envelope): Promise<void>;
  captureScreenshot(): Promise<Screenshot[] | null>;

  fetchNativeRelease(): PromiseLike<NativeReleaseResponse>;
  fetchNativeDeviceContexts(): PromiseLike<NativeDeviceContextsResponse | null>;
  fetchNativeAppStart(): PromiseLike<NativeAppStartResponse | null>;
  fetchNativeFrames(): PromiseLike<NativeFramesResponse | null>;
  fetchNativeSdkInfo(): PromiseLike<Package | null>;

  disableNativeFramesTracking(): void;
  enableNativeFramesTracking(): void;

  addBreadcrumb(breadcrumb: Breadcrumb): void;
  setContext(key: string, context: { [key: string]: unknown } | null): void;
  clearBreadcrumbs(): void;
  setExtra(key: string, extra: unknown): void;
  setUser(user: User | null): void;
  setTag(key: string, value: string): void;

  nativeCrash(): void;

  fetchModules(): Promise<Record<string, string> | null>;
  fetchViewHierarchy(): PromiseLike<Uint8Array | null>;

  startProfiling(): boolean;
  stopProfiling(): { hermesProfile: Hermes.Profile; nativeProfile?: NativeProfileEvent } | null;

  fetchNativePackageName(): Promise<string | null>;

  /**
   * Fetches native stack frames and debug images for the instructions addresses.
   */
  fetchNativeStackFramesBy(instructionsAddr: number[]): Promise<NativeStackFrames | null>;
}

/**
 * Our internal interface for calling native functions
 */
export const NATIVE: SentryNativeWrapper = {
  async fetchModules(): Promise<Record<string, string> | null> {
    if (!this.enableNative) {
      throw this._DisabledNativeError;
    }
    if (!this._isModuleLoaded(RNSentry)) {
      throw this._NativeClientError;
    }

    const raw = await RNSentry.fetchModules();
    if (raw) {
      return JSON.parse(raw);
    }
    return null;
  },
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

    const [EOL] = utf8ToBytes('\n');

    const [envelopeHeader, envelopeItems] = envelope;

    const headerString = JSON.stringify(envelopeHeader);
    let envelopeBytes: number[] = utf8ToBytes(headerString);
    envelopeBytes.push(EOL);

    let hardCrashed: boolean = false;
    for (const rawItem of envelopeItems) {
      const [itemHeader, itemPayload] = this._processItem(rawItem);

      let bytesContentType: string;
      let bytesPayload: number[] = [];
      if (typeof itemPayload === 'string') {
        bytesContentType = 'text/plain';
        bytesPayload = utf8ToBytes(itemPayload);
      } else if (itemPayload instanceof Uint8Array) {
        bytesContentType =
          typeof itemHeader.content_type === 'string' ? itemHeader.content_type : 'application/octet-stream';
        bytesPayload = [...itemPayload];
      } else {
        bytesContentType = 'application/json';
        bytesPayload = utf8ToBytes(JSON.stringify(itemPayload));
        if (!hardCrashed) {
          hardCrashed = isHardCrash(itemPayload);
        }
      }

      // Content type is not inside BaseEnvelopeItemHeaders.
      (itemHeader as BaseEnvelopeItemHeaders).content_type = bytesContentType;
      (itemHeader as BaseEnvelopeItemHeaders).length = bytesPayload.length;
      const serializedItemHeader = JSON.stringify(itemHeader);

      envelopeBytes.push(...utf8ToBytes(serializedItemHeader));
      envelopeBytes.push(EOL);
      envelopeBytes = envelopeBytes.concat(bytesPayload);
      envelopeBytes.push(EOL);
    }

    await RNSentry.captureEnvelope(envelopeBytes, { store: hardCrashed });
  },

  /**
   * Starts native with the provided options.
   * @param options ReactNativeClientOptions
   */
  async initNativeSdk(originalOptions: Partial<ReactNativeClientOptions>): Promise<boolean> {
    const options: Partial<ReactNativeClientOptions> = {
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
          'Note: Native Sentry SDK was not initialized automatically, you will need to initialize it manually. If you wish to disable the native SDK and get rid of this warning, pass enableNative: false',
        );
      }
      this.enableNative = true;
      return false;
    }

    if (!options.dsn) {
      logger.warn(
        'Warning: No DSN was provided. The Sentry SDK will be disabled. Native SDK will also not be initalized.',
      );
      this.enableNative = false;
      return false;
    }

    if (!this._isModuleLoaded(RNSentry)) {
      throw this._NativeClientError;
    }

    // filter out all the options that would crash native.
    /* eslint-disable @typescript-eslint/unbound-method,@typescript-eslint/no-unused-vars */
    const { beforeSend, beforeBreadcrumb, beforeSendTransaction, integrations, ...filteredOptions } = options;
    /* eslint-enable @typescript-eslint/unbound-method,@typescript-eslint/no-unused-vars */
    const nativeIsReady = await RNSentry.initNativeSdk(filteredOptions);

    this.nativeIsReady = nativeIsReady;
    this.enableNative = true;

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
   */
  async fetchNativeSdkInfo(): Promise<Package | null> {
    if (!this.enableNative) {
      throw this._DisabledNativeError;
    }
    if (!this._isModuleLoaded(RNSentry)) {
      throw this._NativeClientError;
    }

    return RNSentry.fetchNativeSdkInfo();
  },

  /**
   * Fetches the device contexts. Not used on Android.
   */
  async fetchNativeDeviceContexts(): Promise<NativeDeviceContextsResponse | null> {
    if (!this.enableNative) {
      throw this._DisabledNativeError;
    }
    if (!this._isModuleLoaded(RNSentry)) {
      throw this._NativeClientError;
    }

    return RNSentry.fetchNativeDeviceContexts();
  },

  async fetchNativeAppStart(): Promise<NativeAppStartResponse | null> {
    if (!this.enableNative) {
      logger.warn(this._DisabledNativeError);
      return null;
    }
    if (!this._isModuleLoaded(RNSentry)) {
      logger.error(this._NativeClientError);
      return null;
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

    // separate and serialize all non-default user keys.
    let userKeys = null;
    let userDataKeys = null;
    if (user) {
      const { id, ip_address, email, username, segment, ...otherKeys } = user;
      const requiredUser: RequiredKeysUser = {
        id,
        ip_address,
        email,
        username,
        segment,
      };
      userKeys = this._serializeObject(requiredUser);
      userDataKeys = this._serializeObject(otherKeys);
    }

    RNSentry.setUser(userKeys, userDataKeys);
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

    const stringifiedValue = typeof value === 'string' ? value : JSON.stringify(value);

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
    const stringifiedExtra = typeof extra === 'string' ? extra : JSON.stringify(extra);

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
      level: breadcrumb.level ? this._processLevel(breadcrumb.level) : undefined,
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

    RNSentry.setContext(key, context !== null ? normalize(context) : null);
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

  enableNativeFramesTracking(): void {
    if (!this.enableNative) {
      return;
    }
    if (!this._isModuleLoaded(RNSentry)) {
      return;
    }

    RNSentry.enableNativeFramesTracking();
  },

  isNativeAvailable(): boolean {
    return this._isModuleLoaded(RNSentry);
  },

  async captureScreenshot(): Promise<Screenshot[] | null> {
    if (!this.enableNative) {
      logger.warn(this._DisabledNativeError);
      return null;
    }
    if (!this._isModuleLoaded(RNSentry)) {
      logger.error(this._NativeClientError);
      return null;
    }

    let raw: NativeScreenshot[] | null | undefined;
    try {
      raw = await RNSentry.captureScreenshot();
    } catch (e) {
      logger.warn('Failed to capture screenshot', e);
    }

    if (raw) {
      return raw.map((item: NativeScreenshot) => ({
        ...item,
        data: new Uint8Array(item.data),
      }));
    } else {
      return null;
    }
  },

  async fetchViewHierarchy(): Promise<Uint8Array | null> {
    if (!this.enableNative) {
      throw this._DisabledNativeError;
    }
    if (!this._isModuleLoaded(RNSentry)) {
      throw this._NativeClientError;
    }

    const raw = await RNSentry.fetchViewHierarchy();
    return raw ? new Uint8Array(raw) : null;
  },

  startProfiling(): boolean {
    if (!this.enableNative) {
      throw this._DisabledNativeError;
    }
    if (!this._isModuleLoaded(RNSentry)) {
      throw this._NativeClientError;
    }

    const { started, error } = RNSentry.startProfiling();
    if (started) {
      logger.log('[NATIVE] Start Profiling');
    } else {
      logger.error('[NATIVE] Start Profiling Failed', error);
    }

    return !!started;
  },

  stopProfiling(): { hermesProfile: Hermes.Profile; nativeProfile?: NativeProfileEvent } | null {
    if (!this.enableNative) {
      throw this._DisabledNativeError;
    }
    if (!this._isModuleLoaded(RNSentry)) {
      throw this._NativeClientError;
    }

    const { profile, nativeProfile, error } = RNSentry.stopProfiling();
    if (!profile || error) {
      logger.error('[NATIVE] Stop Profiling Failed', error);
      return null;
    }
    if (Platform.OS === 'ios' && !nativeProfile) {
      logger.warn('[NATIVE] Stop Profiling Failed: No Native Profile');
    }

    try {
      return {
        hermesProfile: JSON.parse(profile) as Hermes.Profile,
        nativeProfile: nativeProfile as NativeProfileEvent | undefined,
      };
    } catch (e) {
      logger.error('[NATIVE] Failed to parse Hermes Profile JSON', e);
      return null;
    }
  },

  async fetchNativePackageName(): Promise<string | null> {
    if (!this.enableNative) {
      return null;
    }
    if (!this._isModuleLoaded(RNSentry)) {
      return null;
    }

    return (await RNSentry.fetchNativePackageName()) || null;
  },

  async fetchNativeStackFramesBy(instructionsAddr: number[]): Promise<NativeStackFrames | null> {
    if (!this.enableNative) {
      return null;
    }
    if (!this._isModuleLoaded(RNSentry)) {
      return null;
    }

    return (await RNSentry.fetchNativeStackFramesBy(instructionsAddr)) || null;
  },

  /**
   * Gets the event from envelopeItem and applies the level filter to the selected event.
   * @param data An envelope item containing the event.
   * @returns The event from envelopeItem or undefined.
   */
  _processItem(item: EnvelopeItem): EnvelopeItem {
    const [itemHeader, itemPayload] = item;

    if (itemHeader.type == 'event' || itemHeader.type == 'transaction') {
      const event = this._processLevels(itemPayload as Event);

      if (NATIVE.platform === 'android') {
        if ('message' in event) {
          // @ts-expect-error Android still uses the old message object, without this the serialization of events will break.
          event.message = { message: event.message };
        }
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
  _serializeObject(data: { [key: string]: unknown }): { [key: string]: string } {
    const serialized: { [key: string]: string } = {};

    Object.keys(data).forEach(dataKey => {
      const value = data[dataKey];
      serialized[dataKey] = typeof value === 'string' ? value : JSON.stringify(value);
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
      breadcrumbs: event.breadcrumbs?.map(breadcrumb => ({
        ...breadcrumb,
        level: breadcrumb.level ? this._processLevel(breadcrumb.level) : undefined,
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
    if (level == ('log' as SeverityLevel)) {
      return 'debug' as SeverityLevel;
    }
    return level;
  },

  /**
   * Checks whether the RNSentry module is loaded.
   */
  _isModuleLoaded(module: Spec | undefined): module is Spec {
    return !!module;
  },

  _DisabledNativeError: new SentryError('Native is disabled'),

  _NativeClientError: new SentryError("Native Client is not available, can't start on native."),

  enableNative: true,
  nativeIsReady: false,
  platform: Platform.OS,
};
