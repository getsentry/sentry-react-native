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

/**
 * Reads a file from a URI and returns a UInt8Array of its data.
 * @param uri The file URI.
 * @returns A Promise resolving to a UInt8Array.
 */
export async function getDataFromUri(uri: string): Promise<Uint8Array> {
  const response = await fetch(uri);
  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(reader.result));
      } else {
        reject(new Error('Failed to read file as UInt8Array'));
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}
