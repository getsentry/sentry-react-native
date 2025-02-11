import { isFabricEnabled } from '../utils/environment';
import { ReactNativeLibraries } from './../utils/rnlibraries';

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

/* eslint-disable no-bitwise */
export const base64ToUint8Array = (base64?: string): Uint8Array | undefined => {
  if (!base64) return undefined;

  const cleanedBase64 = base64.replace(/^data:.*;base64,/, ''); // Remove any prefix before the base64 string
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes: number[] = [];

  let buffer = 0;
  let bits = 0;

  for (const char of cleanedBase64) {
    if (char === '=') break;

    const value = chars.indexOf(char); // Validate each character
    if (value === -1) return undefined;

    buffer = (buffer << 6) | value; // Shift 6 bits to the left and add the value
    bits += 6;

    if (bits >= 8) {
      // Add a byte when we have 8 or more bits
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  return new Uint8Array(bytes);
};
