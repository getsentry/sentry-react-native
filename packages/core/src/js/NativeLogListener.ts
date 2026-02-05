import { debug } from '@sentry/core';
import { Platform } from 'react-native';
import type { NativeLogEntry } from './options';

/**
 * Sets up the native log listener that forwards logs from the native SDK to JS.
 * This only works when `debug: true` is set in Sentry options.
 *
 * Note: Native log forwarding is not yet implemented. This function is a placeholder
 * for future implementation. Currently, native SDK logs appear in Xcode console (iOS)
 * or Logcat (Android) when `debug: true` is set.
 *
 * @param _callback - The callback to invoke when a native log is received.
 * @returns A function to remove the listener, or undefined if setup failed.
 */
export function setupNativeLogListener(_callback: (log: NativeLogEntry) => void): (() => void) | undefined {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    debug.log('Native log listener is only supported on iOS and Android.');
    return undefined;
  }

  // Native log forwarding is not yet implemented.
  // The infrastructure is in place for when native SDKs support log callbacks.
  debug.log(
    'Native log forwarding is not yet implemented. Native SDK logs will appear in Xcode console (iOS) or Logcat (Android) when debug mode is enabled.',
  );

  return undefined;
}

/**
 * Default handler for native logs that logs to the JS console.
 */
export function defaultNativeLogHandler(log: NativeLogEntry): void {
  const prefix = `[Sentry] [${log.level.toUpperCase()}] [${log.component}]`;
  const message = `${prefix} ${log.message}`;

  switch (log.level.toLowerCase()) {
    case 'fatal':
    case 'error':
      // eslint-disable-next-line no-console
      console.error(message);
      break;
    case 'warning':
      // eslint-disable-next-line no-console
      console.warn(message);
      break;
    case 'info':
      // eslint-disable-next-line no-console
      console.info(message);
      break;
    case 'debug':
    default:
      // eslint-disable-next-line no-console
      console.log(message);
      break;
  }
}
