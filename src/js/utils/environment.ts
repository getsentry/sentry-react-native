import { Platform } from 'react-native';

import { RN_GLOBAL_OBJ } from '../utils/worldwide';
import { getExpoConstants } from './expomodules';
import { ReactNativeLibraries } from './rnlibraries';

/** Checks if the React Native Hermes engine is running */
export function isHermesEnabled(): boolean {
  return !!RN_GLOBAL_OBJ.HermesInternal;
}

/** Checks if the React Native TurboModules are enabled */
export function isTurboModuleEnabled(): boolean {
  return RN_GLOBAL_OBJ.__turboModuleProxy != null;
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
  const expoConstants = getExpoConstants();
  return (expoConstants && expoConstants.appOwnership) === 'expo';
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
  return (
    RN_GLOBAL_OBJ.HermesInternal &&
    RN_GLOBAL_OBJ.HermesInternal.getRuntimeProperties &&
    RN_GLOBAL_OBJ.HermesInternal.getRuntimeProperties()['OSS Release Version']
  );
}

/** Returns default environment based on __DEV__ */
export function getDefaultEnvironment(): 'development' | 'production' {
  return typeof __DEV__ !== 'undefined' && __DEV__ ? 'development' : 'production';
}

/** Check if SDK runs in Metro Dev Server side */
export function isRunningInMetroDevServer(): boolean {
  if (
    typeof RN_GLOBAL_OBJ.process !== 'undefined' &&
    RN_GLOBAL_OBJ.process.env &&
    RN_GLOBAL_OBJ.process.env.___SENTRY_METRO_DEV_SERVER___ === 'true'
  ) {
    return true;
  }
  return false;
}
