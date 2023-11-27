import type { Package } from '@sentry/types';
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';
import type { UnsafeObject } from 'react-native/Libraries/Types/CodegenTypes';

// There has to be only one interface and it has to be named `Spec`
// Only extra allowed definitions are types (probably codegen bug)
export interface Spec extends TurboModule {
  addBreadcrumb(breadcrumb: UnsafeObject): void;
  captureEnvelope(
    bytes: number[],
    options: {
      store: boolean;
    },
  ): Promise<boolean>;
  captureScreenshot(): Promise<NativeScreenshot[] | undefined | null>;
  clearBreadcrumbs(): void;
  crash(): void;
  closeNativeSdk(): Promise<void>;
  disableNativeFramesTracking(): void;
  fetchNativeRelease(): Promise<NativeReleaseResponse>;
  fetchNativeSdkInfo(): Promise<Package | null>;
  fetchNativeDeviceContexts(): Promise<NativeDeviceContextsResponse | null>;
  fetchNativeAppStart(): Promise<NativeAppStartResponse | null>;
  fetchNativeFrames(): Promise<NativeFramesResponse | null>;
  initNativeSdk(options: UnsafeObject): Promise<boolean>;
  setUser(defaultUserKeys: UnsafeObject | null, otherUserKeys: UnsafeObject | null): void;
  setContext(key: string, value: UnsafeObject | null): void;
  setExtra(key: string, value: string): void;
  setTag(key: string, value: string): void;
  enableNativeFramesTracking(): void;
  fetchModules(): Promise<string | undefined | null>;
  fetchViewHierarchy(): Promise<number[] | undefined | null>;
  startProfiling(): { started?: boolean; error?: string };
  stopProfiling(): { profile?: string; nativeProfile?: UnsafeObject; error?: string };
  fetchNativePackageName(): Promise<string | undefined | null>;
  fetchNativeStackFramesBy(instructionsAddr: number[]): Promise<NativeStackFrames | undefined | null>;
}

export type NativeStackFrame = {
  platform: string;
  /**
   * The instruction address of this frame.
   * Formatted as hex with 0x prefix.
   */
  instruction_addr: string;
  package?: string;
  /**
   * The debug image address of this frame.
   * Formatted as hex with 0x prefix.
   */
  image_addr?: string;
  in_app?: boolean;
  /**
   * The symbol name of this frame.
   * If symbolicated locally.
   */
  function?: string;
  /**
   * The symbol address of this frame.
   * If symbolicated locally.
   * Formatted as hex with 0x prefix.
   */
  symbol_addr?: string;
};

export type NativeDebugImage = {
  name?: string;
  type?: string;
  uuid?: string;
  debug_id?: string;
  image_addr?: string;
  image_size?: number;
  code_file?: string;
  image_vmaddr?: string;
};

export type NativeStackFrames = {
  frames: NativeStackFrame[];
  debugMetaImages?: NativeDebugImage[];
};

export type NativeAppStartResponse = {
  isColdStart: boolean;
  appStartTime: number;
  didFetchAppStart: boolean;
};

export type NativeFramesResponse = {
  totalFrames: number;
  slowFrames: number;
  frozenFrames: number;
};

export type NativeReleaseResponse = {
  build: string;
  id: string;
  version: string;
};

/**
 * This type describes serialized scope from sentry-cocoa and sentry-android
 * https://github.com/getsentry/sentry-cocoa/blob/master/Sources/Sentry/SentryScope.m
 * https://github.com/getsentry/sentry-java/blob/a461f7e125b65240004e6162b341f383ce2e1394/sentry-android-core/src/main/java/io/sentry/android/core/InternalSentrySdk.java#L32
 */
export type NativeDeviceContextsResponse = {
  [key: string]: unknown;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  contexts?: Record<string, Record<string, unknown>>;
  user?: {
    userId?: string;
    email?: string;
    username?: string;
    ipAddress?: string;
    segment?: string;
    data?: Record<string, unknown>;
  };
  dist?: string;
  environment?: string;
  fingerprint?: string[];
  level?: string;
  breadcrumbs?: {
    level?: string;
    timestamp?: string;
    category?: string;
    type?: string;
    message?: string;
    data?: Record<string, unknown>;
  }[];
};

export type NativeScreenshot = {
  data: number[];
  contentType: string;
  filename: string;
};

// The export must be here to pass codegen even if not used
export default TurboModuleRegistry.getEnforcing<Spec>('RNSentry');
