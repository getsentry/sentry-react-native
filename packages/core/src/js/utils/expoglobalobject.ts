/**
 * Interface from the Expo SDK defined here
 * (we are describing the native Module
 * the TS typing is only guideline):
 *
 * https://github.com/expo/expo/blob/b51b5139f2caa2a9495e4132437d7ca612276158/packages/expo-constants/src/Constants.ts
 * https://github.com/expo/expo/blob/b51b5139f2caa2a9495e4132437d7ca612276158/packages/expo-manifests/src/Manifests.ts
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
  manifest?: null | {
    [key: string]: unknown;
    /**
     * Expo SDK version should match `expo` version from the app `package.json`.
     * Example "exposdk:50.0.0"
     */
    runtimeVersion?: string;
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
  osName?: string;
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
