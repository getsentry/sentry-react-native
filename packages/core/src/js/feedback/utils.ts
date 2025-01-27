import { isFabricEnabled } from '../utils/environment';
import { ReactNativeLibraries } from './../utils/rnlibraries';

/**
 * Modal is not supported in React Native < 0.71 with Fabric renderer.
 * ref: https://github.com/facebook/react-native/issues/33652
 */
export function isModalSupported(): boolean {
  const { major, minor } = ReactNativeLibraries.ReactNativeVersion?.version || {};
  if (isFabricEnabled() && rnVersion && rnVersion.major === 0 && rnVersion.minor < 71) {
    return false;
  }
  return true;
}

export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
};
