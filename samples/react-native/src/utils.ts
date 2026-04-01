import { LaunchArguments } from 'react-native-launch-arguments';
import * as Sentry from '@sentry/react-native';
import { useFocusEffect } from '@react-navigation/native';

export function logWithoutTracing(...args: unknown[]) {
  if ('__sentry_original__' in (console.log as any)) {
    (console.log as any).__sentry_original__(...args);
  } else {
    console.log(...args);
  }
}

export function shouldUseAutoStart(): boolean {
  const args = LaunchArguments.value<{
    sentryDisableNativeStart?: boolean;
  }>();
  return !!args.sentryDisableNativeStart;
}

export const TimeToFullDisplay = Sentry.createTimeToFullDisplay({
  useFocusEffect,
});
