import type { ExpoConstants, ExpoDevice } from './expoglobalobject';
import { RN_GLOBAL_OBJ } from './worldwide';

/**
 *
 */
export function getExpoConstants(): ExpoConstants | undefined {
  return (
    (RN_GLOBAL_OBJ.expo && RN_GLOBAL_OBJ.expo.modules && RN_GLOBAL_OBJ.expo.modules.ExponentConstants) || undefined
  );
}

/**
 *
 */
export function getExpoDevice(): ExpoDevice | undefined {
  return (RN_GLOBAL_OBJ.expo && RN_GLOBAL_OBJ.expo.modules && RN_GLOBAL_OBJ.expo.modules.ExpoDevice) || undefined;
}
