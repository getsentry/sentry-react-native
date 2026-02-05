import { debug } from '@sentry/core';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type { NativeLogEntry } from './options';

const NATIVE_LOG_EVENT_NAME = 'SentryNativeLog';

let nativeLogListener: ReturnType<NativeEventEmitter['addListener']> | null = null;

/**
 * Sets up the native log listener that forwards logs from the native SDK to JS.
 * This only works when `debug: true` is set in Sentry options.
 *
 * @param callback - The callback to invoke when a native log is received.
 * @returns A function to remove the listener, or undefined if setup failed.
 */
export function setupNativeLogListener(callback: (log: NativeLogEntry) => void): (() => void) | undefined {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    debug.log('Native log listener is only supported on iOS and Android.');
    return undefined;
  }

  if (!NativeModules.RNSentry) {
    debug.warn('Could not set up native log listener: RNSentry module not found.');
    return undefined;
  }

  try {
    // Remove existing listener if any
    if (nativeLogListener) {
      nativeLogListener.remove();
      nativeLogListener = null;
    }

    const eventEmitter = new NativeEventEmitter(NativeModules.RNSentry);

    nativeLogListener = eventEmitter.addListener(
      NATIVE_LOG_EVENT_NAME,
      (event: { level?: string; component?: string; message?: string }) => {
        const logEntry: NativeLogEntry = {
          level: event.level ?? 'info',
          component: event.component ?? 'Sentry',
          message: event.message ?? '',
        };
        callback(logEntry);
      },
    );

    debug.log('Native log listener set up successfully.');

    return () => {
      if (nativeLogListener) {
        nativeLogListener.remove();
        nativeLogListener = null;
        debug.log('Native log listener removed.');
      }
    };
  } catch (error) {
    debug.warn('Failed to set up native log listener:', error);
    return undefined;
  }
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
