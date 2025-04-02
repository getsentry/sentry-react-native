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

/**
 * Converts a Uint8Array to a Base64 string
 * @param {Uint8Array} uint8Array - The Uint8Array containing image data
 * @returns {string} - Base64 string representation of the data
 */
export const uint8ArrayToBase64 = (uint8Array: Uint8Array): string => {
  /* eslint-disable no-bitwise */
  let base64 = '';
  const encodings = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes = uint8Array;
  const byteLength = bytes.byteLength;
  const byteRemainder = byteLength % 3;
  const mainLength = byteLength - byteRemainder;

  for (let i = 0; i < mainLength; i = i + 3) {
    const chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];

    // Use bitmasks to extract 6-bit segments from the triplet
    const a = (chunk & 16515072) >> 18; // 16515072 = (2^6 - 1) << 18
    const b = (chunk & 258048) >> 12; // 258048 = (2^6 - 1) << 12
    const c = (chunk & 4032) >> 6; // 4032 = (2^6 - 1) << 6
    const d = chunk & 63; // 63 = 2^6 - 1

    // Convert the raw binary segments to the appropriate ASCII encoding
    base64 += encodings[a] + encodings[b] + encodings[c] + encodings[d];
  }

  // Deal with the remaining bytes and padding
  if (byteRemainder === 1) {
    const chunk = bytes[mainLength];

    const a = (chunk & 252) >> 2; // 252 = (2^6 - 1) << 2
    const b = (chunk & 3) << 4; // 3 = 2^2 - 1

    base64 += `${encodings[a] + encodings[b]}==`;
  } else if (byteRemainder === 2) {
    const chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1];

    const a = (chunk & 64512) >> 10; // 64512 = (2^6 - 1) << 10
    const b = (chunk & 1008) >> 4; // 1008 = (2^6 - 1) << 4
    const c = (chunk & 15) << 2; // 15 = 2^4 - 1

    base64 += `${encodings[a] + encodings[b] + encodings[c]}=`;
  }
  /* eslint-enable no-bitwise */
  return base64;
};

export const feedbackAlertDialog = (title: string, message: string): void => {
  if (isWeb() && typeof RN_GLOBAL_OBJ.alert !== 'undefined') {
    RN_GLOBAL_OBJ.alert(`${title}\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};
