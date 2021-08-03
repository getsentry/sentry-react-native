import { Breadcrumb, Package } from "@sentry/types";

import { ReactNativeOptions } from "./options";

export type NativeAppStartResponse = {
  isColdStart: boolean;
  appStartTime: number;
  didFetchAppStart: boolean;
};

export type NativeReleaseResponse = {
  build: string;
  id: string;
  version: string;
};

export type NativeDeviceContextsResponse = {
  [key: string]: Record<string, unknown>;
};

interface SerializedObject {
  [key: string]: string;
}

export interface SentryNativeBridgeModule {
  nativeClientAvailable: boolean;

  addBreadcrumb(breadcrumb: Breadcrumb): void;
  captureEnvelope(
    payload:
      | string
      | {
          header: Record<string, unknown>;
          payload: Record<string, unknown>;
        }
  ): PromiseLike<boolean>;
  clearBreadcrumbs(): void;
  crash(): void;
  closeNativeSdk(): PromiseLike<void>;
  fetchNativeRelease(): Promise<{
    build: string;
    id: string;
    version: string;
  }>;
  fetchNativeDeviceContexts(): PromiseLike<NativeDeviceContextsResponse>;
  fetchNativeAppStart(): PromiseLike<NativeAppStartResponse>;
  getStringBytesLength(str: string): Promise<number>;
  initNativeSdk(options: ReactNativeOptions): Promise<boolean>;
  setUser(
    defaultUserKeys: SerializedObject | null,
    otherUserKeys: SerializedObject | null
  ): void;
  setContext(key: string, value: SerializedObject | null): void;
  setExtra(key: string, value: string): void;
  setTag(key: string, value: string): void;
}
