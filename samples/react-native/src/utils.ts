import { Platform } from 'react-native';
import { LaunchArguments } from 'react-native-launch-arguments';
import BuildConfig from 'react-native-build-config';
import * as Sentry from '@sentry/react-native';
import { useFocusEffect } from '@react-navigation/native';

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

export const TimeToFullDisplay = Sentry.createTimeToFullDisplay({
  useFocusEffect,
});
