import { LogBox, YellowBox } from 'react-native';

/**
 * This is a workaround for now using fetch on RN, this is a known issue in react-native and only generates a warning
 * YellowBox deprecated and replaced with with LogBox in RN 0.63
 */
export function disableRequireCycleLogs() {
  if (LogBox) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    LogBox.ignoreLogs(['Require cycle:']);
  } else {
    // eslint-disable-next-line deprecation/deprecation
    YellowBox.ignoreWarnings(['Require cycle:']);
  }
}
