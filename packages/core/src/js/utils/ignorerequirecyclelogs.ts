import { LogBox } from 'react-native';

interface ReactNativeVersion {
  major: number;
  minor: number;
}

/**
 * This is a workaround for using fetch on RN, this is a known issue in react-native and only generates a warning.
 */
export function ignoreRequireCycleLogs(version?: ReactNativeVersion): void {
  if (version && version.major === 0 && version.minor < 70) {
    // Do not ignore require cycle logs on React Native versions >= 0.70
    // https://github.com/getsentry/sentry-react-native/issues/3484#issuecomment-1877034820
    LogBox.ignoreLogs(['Require cycle:']);
  }
}
