import { Alert } from 'react-native';

import { isFabricEnabled, isWeb } from '../utils/environment';
import { RN_GLOBAL_OBJ } from '../utils/worldwide';
import { ReactNativeLibraries } from './../utils/rnlibraries';

declare global {
  // Declaring atob function to be used in web environment
  function atob(encodedString: string): string;
}

/**
 * Modal is not supported in React Native < 0.71 with Fabric renderer.
 * ref: https://github.com/facebook/react-native/issues/33652
 */
export function isModalSupported(): boolean {
  const { major, minor } = ReactNativeLibraries.ReactNativeVersion?.version || {};
  return !(isFabricEnabled() && major === 0 && minor < 71);
}

/**
 * The native driver supports color animations since React Native 0.69.
 * ref: https://github.com/facebook/react-native/commit/201f355479cafbcece3d9eb40a52bae003da3e5c
 */
export function isNativeDriverSupportedForColorAnimations(): boolean {
  const { major, minor } = ReactNativeLibraries.ReactNativeVersion?.version || {};
  return major > 0 || minor >= 69;
}

export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
};

/**
 * Converts base64 string to Uint8Array on the web
 * @param base64 base64 string
 * @returns Uint8Array data
 */
export const base64ToUint8Array = (base64: string): Uint8Array => {
  if (typeof atob !== 'function' || !isWeb()) {
    throw new Error('atob is not available in this environment.');
  }

  const binaryString = atob(base64);
  return new Uint8Array([...binaryString].map(char => char.charCodeAt(0)));
};

export const feedbackAlertDialog = (title: string, message: string): void => {
  if (isWeb() && typeof RN_GLOBAL_OBJ.alert !== 'undefined') {
    RN_GLOBAL_OBJ.alert(`${title}\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};
