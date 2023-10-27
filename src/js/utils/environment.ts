import { version as RNV } from 'react-native/Libraries/Core/ReactNativeVersion';

import { RN_GLOBAL_OBJ } from '../utils/worldwide';

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
export function getReactNativeVersion(): string {
  return `${RNV.major}.${RNV.minor}.${RNV.patch}${RNV.prerelease != null ? `-${RNV.prerelease}` : ''}`;
}

/** Checks if Expo is present in the runtime */
export function isExpo(): boolean {
  return RN_GLOBAL_OBJ.expo != null;
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
