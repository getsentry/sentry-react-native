import { LogBox } from 'react-native';

/**
 * This is a workaround for using fetch on RN, this is a known issue in react-native and only generates a warning.
 */
export function ignoreRequireCycleLogs(): void {
  LogBox.ignoreLogs(['Require cycle:']);
}
