/**
 * Interface from the Expo SDK defined here
 * (we are describing the native Module
 * the TS typing is only guideline):
 *
 * https://github.com/expo/expo/blob/b51b5139f2caa2a9495e4132437d7ca612276158/packages/expo-constants/src/Constants.ts
 * https://github.com/expo/expo/blob/b51b5139f2caa2a9495e4132437d7ca612276158/packages/expo-manifests/src/Manifests.ts
 * https://github.com/expo/expo/blob/fce7f6eb2ea2611cb30e9cb20baaeee2ac0a18b6/packages/expo-constants/src/Constants.types.ts
 */
export interface ExpoConstants {
  expoVersion?: string | null;
  manifest?: null | {
    [key: string]: unknown;
    /**
     * Expo SDK version should match `expo` version from the app `package.json`.
     * Example "exposdk:50.0.0"
     */
    runtimeVersion?: string;
  };
  /**
   * Returns the current execution environment.
   * Values: 'bare', 'standalone', 'storeClient'
   */
  executionEnvironment?: string;
  /**
   * Deprecated. Returns 'expo' when running in Expo Go, otherwise null.
   */
  appOwnership?: string | null;
  /**
   * Identifies debug vs. production builds.
   */
  debugMode?: boolean;
  /**
   * Unique identifier per app session.
   */
  sessionId?: string;
  /**
   * Runtime version info.
   */
  expoRuntimeVersion?: string | null;
  /**
   * Device status bar height.
   */
  statusBarHeight?: number;
  /**
   * Available system fonts.
   */
  systemFonts?: string[];
  /**
   * The standard Expo config object defined in app.json and app.config.js files.
   */
  expoConfig?: null | {
    [key: string]: unknown;
    name?: string;
    slug?: string;
    version?: string;
    sdkVersion?: string;
  };
  /**
   * EAS configuration when applicable.
   */
  easConfig?: null | {
    [key: string]: unknown;
    projectId?: string;
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

/**
 * Interface from the Expo SDK defined here
 * (we are describing the native module
 * the TS typing is only guideline)
 *
 * https://github.com/expo/expo/blob/8b7165ad2c6751c741f588c72dac50fb3a814dcc/packages/expo-updates/src/Updates.ts
 */
export interface ExpoUpdates {
  isEnabled?: boolean;
  updateId?: string | null;
  channel?: string | null;
  runtimeVersion?: string | null;
  checkAutomatically?: string | null;
  isEmergencyLaunch?: boolean;
  emergencyLaunchReason?: string | null;
  launchDuration?: number | null;
  isEmbeddedLaunch?: boolean;
  isUsingEmbeddedAssets?: boolean;
  createdAt?: Date | null;
}

export type ExpoGo = unknown;

export interface ExpoGlobalObject {
  modules?: {
    ExponentConstants?: ExpoConstants;
    ExpoDevice?: ExpoDevice;
    ExpoUpdates?: ExpoUpdates;
    ExpoGo?: ExpoGo;
  };
}
