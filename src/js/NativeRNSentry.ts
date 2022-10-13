import { Package } from '@sentry/types';
import { TurboModule, TurboModuleRegistry } from 'react-native';
import type { UnsafeObject } from 'react-native/Libraries/Types/CodegenTypes';

// There has to be only one interface and it has to be named `Spec`
// Only extra allowed definitions are types (probably codegen bug)
export interface Spec extends TurboModule {
  addBreadcrumb(breadcrumb: UnsafeObject): void;
  captureEnvelope(
    bytes: number[],
    options: {
      store: boolean,
    },
  ): Promise<boolean>;
  clearBreadcrumbs(): void;
  crash(): void;
  closeNativeSdk(): Promise<void>;
  disableNativeFramesTracking(): void;
  fetchNativeRelease(): Promise<NativeReleaseResponse>;
  fetchNativeSdkInfo(): Promise<Package>;
  fetchNativeDeviceContexts(): Promise<NativeDeviceContextsResponse>;
  fetchNativeAppStart(): Promise<NativeAppStartResponse | null>;
  fetchNativeFrames(): Promise<NativeFramesResponse | null>;
  initNativeSdk(options: UnsafeObject): Promise<boolean>;
  setUser(
    defaultUserKeys: UnsafeObject | null,
    otherUserKeys: UnsafeObject | null
  ): void;
  setContext(key: string, value: UnsafeObject | null): void;
  setExtra(key: string, value: string): void;
  setTag(key: string, value: string): void;
  enableNativeFramesTracking(): void;
}

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

export type NativeDeviceContextsResponse = {
  [key: string]: Record<string, unknown>;
};

// The export must be here to pass codegen even if not used
export default TurboModuleRegistry.getEnforcing<Spec>('RNSentry');
