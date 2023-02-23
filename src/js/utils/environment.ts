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
