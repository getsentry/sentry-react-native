/* eslint-disable @typescript-eslint/ban-types */
import { Package } from '@sentry/types';
import { TurboModule, TurboModuleRegistry } from 'react-native';

// There has to be only one interface and it has to be named `Spec`
// Only extra allowed definitions are types
export interface Spec extends TurboModule {
  addBreadcrumb(breadcrumb: {}): void;
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
  fetchNativeRelease(): Promise<{
    build: string;
    id: string;
    version: string;
  }>;
  fetchNativeSdkInfo(): Promise<Package>;
  fetchNativeDeviceContexts(): Promise<NativeDeviceContextsResponse>;
  fetchNativeAppStart(): Promise<NativeAppStartResponse | null>;
  fetchNativeFrames(): Promise<NativeFramesResponse | null>;
  initNativeSdk(options: {}): Promise<boolean>;
  setUser(
    defaultUserKeys: {} | null,
    otherUserKeys: {} | null
  ): void;
  setContext(key: string, value: {} | null): void;
  setExtra(key: string, value: string): void;
  setTag(key: string, value: string): void;
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

// The export must be here even if not used to pass codegen
export default TurboModuleRegistry.getEnforcing<Spec>('RNSentry');
