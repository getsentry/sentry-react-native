import { Platform } from 'react-native';

import { RN_GLOBAL_OBJ } from '../utils/worldwide';
import { getExpoConstants, getExpoGo } from './expomodules';
import { ReactNativeLibraries } from './rnlibraries';

// Provided by Metro. Declared here because the SDK isn't built with Node types.
declare const process: { env: Record<string, string | undefined> };

/** Checks if the React Native Hermes engine is running */
export function isHermesEnabled(): boolean {
  return !!RN_GLOBAL_OBJ.HermesInternal;
}

/** Checks if the React Native TurboModules are enabled */
export function isTurboModuleEnabled(): boolean {
  // Reference: https://github.com/facebook/react-native/blob/641a79dc5137b69a3c0813413b9fb82d0b9df783/packages/react-native/src/private/featureflags/ReactNativeFeatureFlagsBase.js#L110
  return RN_GLOBAL_OBJ.RN$Bridgeless === true || RN_GLOBAL_OBJ.__turboModuleProxy != null;
}

/** Checks if the React Native Fabric renderer is running */
export function isFabricEnabled(): boolean {
  return RN_GLOBAL_OBJ.nativeFabricUIManager != null;
}

/** Returns React Native Version as semver string */
export function getReactNativeVersion(): string | undefined {
  if (!ReactNativeLibraries.ReactNativeVersion) {
    return undefined;
  }
  const RNV = ReactNativeLibraries.ReactNativeVersion.version;
  return `${RNV.major}.${RNV.minor}.${RNV.patch}${RNV.prerelease != null ? `-${RNV.prerelease}` : ''}`;
}

/** Checks if Expo is present in the runtime */
export function isExpo(): boolean {
  return RN_GLOBAL_OBJ.expo != null;
}

/** Check if JS runs in Expo Go */
export function isExpoGo(): boolean {
  const expoGo = getExpoGo();
  return !!expoGo;
}

/** Check Expo Go version if available */
export function getExpoGoVersion(): string | undefined {
  const expoConstants = getExpoConstants();
  return typeof expoConstants?.expoVersion === 'string' ? expoConstants.expoVersion : undefined;
}

/** Returns Expo SDK version if available */
export function getExpoSdkVersion(): string | undefined {
  const expoConstants = getExpoConstants();
  const [, expoSdkVersion] =
    typeof expoConstants?.manifest?.runtimeVersion === 'string' ? expoConstants.manifest.runtimeVersion.split(':') : [];
  return expoSdkVersion;
}

/** Checks if the current platform is web */
export function isWeb(): boolean {
  return Platform.OS === 'web';
}

/**
 * Checks if Expo's native fetch implementation (`expo/fetch`) is active.
 * Expo SDK 56+ replaces `globalThis.fetch` with a native implementation
 * that bypasses XHR entirely. The SDK needs to know this to enable
 * fetch instrumentation instead of relying on XHR instrumentation.
 */
export function isExpoFetchEnabled(): boolean {
  if (typeof globalThis.fetch !== 'function') {
    return false;
  }
  const fetch = globalThis.fetch as unknown as Record<symbol, unknown>;
  if (fetch[Symbol.for('expo.builtin')] === true) {
    return true;
  }
  // `@expo/metro-runtime` < 58.0.15 wraps fetch in Expo Router apps and drops the `expo.builtin` marker.
  // Behind the wrapper, `expo/fetch` is active on Expo SDK 56+ unless the app opted out.
  return (
    fetch[Symbol.for('expo.polyfillFetchWithWindowLocation')] === true &&
    (getExpoSdkMajorVersion() ?? 0) >= 56 &&
    !isReactNativeFetchForced()
  );
}

function getExpoSdkMajorVersion(): number | undefined {
  // The native module exposes the embedded app config as `manifest` (a JSON string on Android).
  // `expoConfig` is only built by the `expo-constants` JS module.
  const manifest: unknown = getExpoConstants()?.manifest;
  let sdkVersion: unknown;
  try {
    const appConfig = typeof manifest === 'string' ? JSON.parse(manifest) : manifest;
    sdkVersion = (appConfig as { sdkVersion?: unknown } | null | undefined)?.sdkVersion;
  } catch {
    return undefined;
  }
  const major = typeof sdkVersion === 'string' ? parseInt(sdkVersion, 10) : NaN;
  return isNaN(major) ? undefined : major;
}

function isReactNativeFetchForced(): boolean {
  try {
    // Read exactly like `expo`'s runtime does, so both resolve the same value after babel-preset-expo.
    const useRnFetch = process.env.EXPO_PUBLIC_USE_RN_FETCH;
    return useRnFetch === '1' || useRnFetch === 'true';
  } catch {
    return false;
  }
}

/**
 * Checks if React Native reports `resource` performance entries for its network requests.
 * Reported by default since React Native 0.83 (0.81 and 0.82 have it behind a feature flag).
 */
export function isResourceTimingSupported(): boolean {
  const { major, minor } = ReactNativeLibraries.ReactNativeVersion?.version || {};
  if (major === undefined || minor === undefined) {
    return false;
  }
  return major > 0 || minor >= 83;
}

/** Checks if the current platform is not web */
export function notWeb(): boolean {
  return Platform.OS !== 'web';
}

/** Checks if the current platform is supported mobile platform (iOS or Android) */
export function isMobileOs(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

/** Checks if the current platform is not supported mobile platform (iOS or Android) */
export function notMobileOs(): boolean {
  return !isMobileOs();
}

/** Returns Hermes Version if hermes is present in the runtime */
export function getHermesVersion(): string | undefined {
  return RN_GLOBAL_OBJ.HermesInternal?.getRuntimeProperties?.()['OSS Release Version'];
}

/** Returns default environment based on __DEV__ */
export function getDefaultEnvironment(): 'development' | 'production' {
  return typeof __DEV__ !== 'undefined' && __DEV__ ? 'development' : 'production';
}

/** Check if SDK runs in Metro Dev Server side */
export function isRunningInMetroDevServer(): boolean {
  if (
    typeof RN_GLOBAL_OBJ.process !== 'undefined' &&
    RN_GLOBAL_OBJ.process.env?.___SENTRY_METRO_DEV_SERVER___ === 'true'
  ) {
    return true;
  }
  return false;
}
