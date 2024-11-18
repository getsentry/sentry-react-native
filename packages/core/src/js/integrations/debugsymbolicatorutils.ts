import type { StackFrame as SentryStackFrame } from '@sentry/types';

import { ReactNativeLibraries } from '../utils/rnlibraries';
import { createStealthXhr, XHR_READYSTATE_DONE } from '../utils/xhr';
import type * as ReactNative from '../vendor/react-native';
import { logger } from '@sentry/utils';

const SENTRY_CONTEXT_URL = `${getDevServer().url}__sentry/context`;

/**
 * Fetches source context for the Sentry Middleware (/__sentry/context)
 *
 * @param frame StackFrame
 * @param getDevServer function from RN to get DevServer URL
 */
export async function fetchSourceContext(frames: SentryStackFrame[]): Promise<SentryStackFrame[]> {
  return new Promise(resolve => {
    try {
      const xhr = createStealthXhr();
      if (!xhr) {
        resolve(frames);
        return;
      }

      xhr.open('POST', SENTRY_CONTEXT_URL, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({ stack: frames }));

      xhr.onreadystatechange = (): void => {
        if (xhr.readyState === XHR_READYSTATE_DONE) {
          if (xhr.status !== 200) {
            resolve(frames);
          }

          try {
            const response = JSON.parse(xhr.responseText);
            if (Array.isArray(response.stack)) {
              resolve(response.stack);
            } else {
              resolve(frames);
            }
          } catch (error) {
            resolve(frames);
          }
        }
      };
      xhr.onerror = (): void => {
        resolve(frames);
      };
    } catch (error) {
      logger.error('Could not fetch source context.', error);
      resolve(frames);
    }
  });
}

/**
 * Loads and calls RN Core Devtools parseErrorStack function.
 */
export function parseErrorStack(errorStack: string): Array<ReactNative.StackFrame> {
  if (!ReactNativeLibraries.Devtools) {
    throw new Error('React Native Devtools not available.');
  }
  return ReactNativeLibraries.Devtools.parseErrorStack(errorStack);
}

/**
 * Loads and calls RN Core Devtools symbolicateStackTrace function.
 */
export function symbolicateStackTrace(
  stack: Array<ReactNative.StackFrame>,
  extraData?: Record<string, unknown>,
): Promise<ReactNative.SymbolicatedStackTrace> {
  if (!ReactNativeLibraries.Devtools) {
    throw new Error('React Native Devtools not available.');
  }
  return ReactNativeLibraries.Devtools.symbolicateStackTrace(stack, extraData);
}

/**
 * Loads and returns the RN DevServer URL.
 */
export function getDevServer(): ReactNative.DevServerInfo | undefined {
  try {
    return ReactNativeLibraries.Devtools?.getDevServer();
  } catch (_oO) {
    // We can't load devserver URL
  }
  return undefined;
}
