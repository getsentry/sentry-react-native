import type { ExpoConstants, ExpoDevice, ExpoUpdates } from './expoglobalobject';
import { RN_GLOBAL_OBJ } from './worldwide';

/**
 * Returns the Expo Constants module if present
 */
export function getExpoConstants(): ExpoConstants | undefined {
  return RN_GLOBAL_OBJ.expo?.modules?.ExponentConstants ?? undefined;
}

/**
 * Returns the Expo Device module if present
 */
export function getExpoDevice(): ExpoDevice | undefined {
  return RN_GLOBAL_OBJ.expo?.modules?.ExpoDevice ?? undefined;
}

/**
 * Returns the Expo Updates module if present
 */
export function getExpoUpdates(): ExpoUpdates | undefined {
  return RN_GLOBAL_OBJ.expo?.modules?.ExpoUpdates ?? undefined;
}
