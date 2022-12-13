/* eslint-disable deprecation/deprecation */
import { LogBox, YellowBox } from 'react-native';

/**
 * This is a workaround for now using fetch on RN, this is a known issue in react-native and only generates a warning
 * YellowBox deprecated and replaced with with LogBox in RN 0.63
 */
export function ignoreRequireCycleLogs(): void {
  if (LogBox) {
    LogBox.ignoreLogs(['Require cycle:']);
  } else {
    YellowBox.ignoreWarnings(['Require cycle:']);
  }
}
