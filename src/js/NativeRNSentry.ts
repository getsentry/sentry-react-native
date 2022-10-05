import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';
import { Package } from '@sentry/types';

export interface Spec extends TurboModule {
  // nativeClientAvailable: boolean;

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

export default TurboModuleRegistry.getEnforcing<Spec>('RNSentry');
