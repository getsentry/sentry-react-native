import type { ExpoConstants, ExpoDevice } from './expoglobalobject';
import { RN_GLOBAL_OBJ } from './worldwide';

/**
 * Returns the Expo Constants module if present
 */
export function getExpoConstants(): ExpoConstants | undefined {
  return (
    (RN_GLOBAL_OBJ.expo && RN_GLOBAL_OBJ.expo.modules && RN_GLOBAL_OBJ.expo.modules.ExponentConstants) || undefined
  );
}

/**
 * Returns the Expo Device module if present
 */
export function getExpoDevice(): ExpoDevice | undefined {
  return (RN_GLOBAL_OBJ.expo && RN_GLOBAL_OBJ.expo.modules && RN_GLOBAL_OBJ.expo.modules.ExpoDevice) || undefined;
}
