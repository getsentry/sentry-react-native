import { getGlobalObject } from '@sentry/utils';

interface ReactNativeGlobal {
  HermesInternal: unknown;
  __turboModuleProxy: unknown;
  nativeFabricUIManager: unknown;
}

/** Safely gets global object with React Native specific properties */
function getRNGlobalObject<T>(): T & ReactNativeGlobal & ReturnType<typeof getGlobalObject> {
  return getGlobalObject<T & ReactNativeGlobal>();
}

/** Checks if the React Native Hermes engine is running */
export function isHermesEnabled(): boolean {
  return !!getRNGlobalObject().HermesInternal;
}

/** Checks if the React Native TurboModules are enabled */
export function isTurboModuleEnabled(): boolean {
  return getRNGlobalObject().__turboModuleProxy != null;
}

/** Checks if the React Native Fabric renderer is running */
export function isFabricEnabled(): boolean {
  return getRNGlobalObject().nativeFabricUIManager != null;
}
