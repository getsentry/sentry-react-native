import BuildConfig from 'react-native-build-config';
import { Platform } from 'react-native';
import { LaunchArguments } from 'react-native-launch-arguments';
import * as Sentry from '@sentry/react-native';
import { useFocusEffect } from '@react-navigation/native';

import { SENTRY_INTERNAL_DSN } from './dsn';

export function logWithoutTracing(...args: unknown[]) {
  if ('__sentry_original__' in console.log) {
    console.log.__sentry_original__(...args);
  } else {
    console.log(...args);
  }
}

export function shouldUseAutoStart(): boolean {
  if (Platform.OS === 'android') {
    return !!(
      BuildConfig as {
        SENTRY_DISABLE_NATIVE_START?: boolean;
      }
    ).SENTRY_DISABLE_NATIVE_START;
  } else if (Platform.OS === 'ios') {
    const args = LaunchArguments.value<{
      sentrydisablenativestart?: boolean;
    }>();
    return !!args.sentrydisablenativestart;
  } else {
    return false;
  }
}

export const isE2ETest = () => {
  try {
    return !!LaunchArguments.value().isE2ETest;
  } catch (e) {
    return false;
  }
};

export const getDsn = () => {
  if (isE2ETest() && Platform.OS === 'android') {
    return 'http://key@10.0.2.2:8961/123456';
  }
  if (isE2ETest() && Platform.OS === 'ios') {
    return 'http://key@localhost:8961/123456';
  }
  return SENTRY_INTERNAL_DSN;
};

export const TimeToFullDisplay = Sentry.createTimeToFullDisplay({
  useFocusEffect,
});
