/**
 * Interface from the Expo SDK defined here
 * (we are describing the native Module
 * the TS typing is only guideline):
 *
 * https://github.com/expo/expo/blob/5d1153e6ae7c497fa1281ffee85fabe90d2321c2/packages/expo-constants/src/Constants.types.ts#L124
 */
export interface ExpoConstants {
  appOwnership?: 'standalone' | 'expo' | 'guest';
  /**
   * Deprecated. But until removed we can use it as user ID to match the native SDKs.
   */
  installationId?: string;
  /**
   * Version of the Expo Go app
   */
  expoVersion?: string | null;
  expoConfig?: null | {
    [key: string]: unknown;
    /**
     * Expo SDK version should match `expo` version from the app `package.json`.
     */
    sdkVersion?: string;
  };
}

/**
 * Interface from the Expo SDK defined here
 * (we are describing the native module
 * the TS typing is only guideline)
 *
 * https://github.com/expo/expo/blob/5d1153e6ae7c497fa1281ffee85fabe90d2321c2/packages/expo-device/src/Device.ts
 */
export interface ExpoDevice {
  deviceName?: string;
  isDevice?: boolean;
  manufacturer?: string;
  modelName?: string;
  osBuildId?: string;
  osVersion?: string;
  totalMemory?: number;
}

export interface ExpoGlobalObject {
  modules?: {
    ExponentConstants?: ExpoConstants;
    ExpoDevice?: ExpoDevice;
  };
}
