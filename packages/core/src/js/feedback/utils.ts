import { Alert } from 'react-native';

import { isFabricEnabled, isWeb } from '../utils/environment';
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
  /* eslint-disable @typescript-eslint/ban-ts-comment, no-restricted-globals, no-alert, @typescript-eslint/no-unsafe-member-access */
  // @ts-ignore
  if (isWeb() && typeof window !== 'undefined') {
    // @ts-ignore
    window.alert(`${title}\n${message}`);
    /* eslint-enable @typescript-eslint/ban-ts-comment, no-restricted-globals, no-alert, @typescript-eslint/no-unsafe-member-access */
  } else {
    Alert.alert(title, message);
  }
};
