import type { StackFrame as SentryStackFrame } from '@sentry/core';

import { debug, parseStackFrames } from '@sentry/core';
import { defaultStackParser } from '@sentry/react';

import type * as ReactNative from '../vendor/react-native';

import { SENTRY_CONTEXT_REQUEST_PATH, SENTRY_SYMBOLICATE_REQUEST_PATH } from '../metro/constants';
import { ReactNativeLibraries } from '../utils/rnlibraries';
import { createStealthXhr, XHR_READYSTATE_DONE } from '../utils/xhr';

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

      const url = getSentryMetroSourceContextUrl();
      if (!url) {
        debug.error('Could not fetch source context. No dev server URL found.');
        resolve(frames);
        return;
      }

      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({ stack: frames }));

      xhr.onreadystatechange = (): void => {
        if (xhr.readyState === XHR_READYSTATE_DONE) {
          if (xhr.status !== 200) {
            resolve(frames);
          }

          try {
            const response: { stack?: SentryStackFrame[] } = JSON.parse(xhr.responseText);
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
      debug.error('Could not fetch source context.', error);
      resolve(frames);
    }
  });
}

function getSentryMetroSourceContextUrl(): string | undefined {
  const devServer = getDevServer();

  if (!devServer) {
    return undefined;
  }

  return `${devServer.url}${SENTRY_CONTEXT_REQUEST_PATH}`;
}

/**
 * Converts Sentry StackFrames to React Native StackFrames.
 * This is the reverse of convertReactNativeFramesToSentryFrames in debugsymbolicator.ts
 */
function convertSentryFramesToReactNativeFrames(frames: SentryStackFrame[]): Array<ReactNative.StackFrame> {
  // Reverse the frames because Sentry parser returns them in reverse order compared to RN
  return frames.reverse().map((frame): ReactNative.StackFrame => {
    const rnFrame: ReactNative.StackFrame = {
      methodName: frame.function || '?',
    };

    if (frame.filename !== undefined) {
      rnFrame.file = frame.filename;
    }

    if (frame.lineno !== undefined) {
      rnFrame.lineNumber = frame.lineno;
    }

    if (frame.colno !== undefined) {
      rnFrame.column = frame.colno;
    }

    return rnFrame;
  });
}

/**
 * Parses an error stack string into React Native StackFrames.
 * Uses RN Devtools parseErrorStack by default for compatibility.
 * Falls back to Sentry's built-in stack parser if Devtools is not available.
 *
 * @param errorStack - Raw stack trace string from Error.stack
 * @returns Array of React Native StackFrame objects
 */
export function parseErrorStack(errorStack: string): Array<ReactNative.StackFrame> {
  // Try using RN Devtools first for maximum compatibility with existing tooling
  if (ReactNativeLibraries.Devtools?.parseErrorStack) {
    try {
      return ReactNativeLibraries.Devtools.parseErrorStack(errorStack);
    } catch (error) {
      debug.warn('RN Devtools parseErrorStack failed, falling back to Sentry stack parser');
    }
  }

  // Fallback: Use Sentry's stack parser (works without RN Devtools dependency)
  try {
    // Create a temporary Error object with the stack
    const error = new Error();
    error.stack = errorStack;

    // Use Sentry's parser to parse the stack
    const sentryFrames = parseStackFrames(defaultStackParser, error);

    // Convert Sentry frames back to RN format
    return convertSentryFramesToReactNativeFrames(sentryFrames);
  } catch (error) {
    debug.error('Failed to parse error stack:', error);
    return [];
  }
}

/**
 * Symbolicates the stack using the local dev server.
 *
 * Uses RN Devtools symbolicateStackTrace by default for compatibility.
 * Falls back to the Sentry Metro middleware (/__sentry/symbolicate) if Devtools
 * is not available or fails, so we don't depend on RN internals that are
 * scheduled for removal from the RN public API.
 */
export async function symbolicateStackTrace(
  stack: Array<ReactNative.StackFrame>,
  extraData?: Record<string, unknown>,
): Promise<ReactNative.SymbolicatedStackTrace> {
  if (ReactNativeLibraries.Devtools?.symbolicateStackTrace) {
    try {
      return await ReactNativeLibraries.Devtools.symbolicateStackTrace(stack, extraData);
    } catch (error) {
      debug.warn('RN Devtools symbolicateStackTrace failed, falling back to Sentry Metro middleware.');
    }
  }

  return symbolicateStackTraceWithSentryMiddleware(stack, extraData);
}

/**
 * Symbolicates the stack using the Sentry Metro middleware (/__sentry/symbolicate),
 * which forwards the request to Metro's own `/symbolicate` endpoint.
 *
 * Rejects if the dev server is not available or the request fails.
 */
function symbolicateStackTraceWithSentryMiddleware(
  stack: Array<ReactNative.StackFrame>,
  extraData?: Record<string, unknown>,
): Promise<ReactNative.SymbolicatedStackTrace> {
  return new Promise((resolve, reject) => {
    try {
      const devServer = getDevServer();
      if (!devServer?.bundleLoadedFromServer) {
        reject(new Error('Bundle was not loaded from Metro.'));
        return;
      }

      const xhr = createStealthXhr();
      if (!xhr) {
        reject(new Error('XMLHttpRequest is not available.'));
        return;
      }

      xhr.open('POST', `${devServer.url}${SENTRY_SYMBOLICATE_REQUEST_PATH}`, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onreadystatechange = (): void => {
        if (xhr.readyState !== XHR_READYSTATE_DONE) {
          return;
        }
        if (xhr.status !== 200) {
          reject(new Error(`Symbolication request failed with status ${xhr.status}.`));
          return;
        }
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch (error) {
          reject(new Error('Could not parse symbolication response.'));
        }
      };
      xhr.onerror = (): void => {
        reject(new Error('Symbolication request failed.'));
      };
      xhr.send(JSON.stringify({ stack, extraData }));
    } catch (error) {
      reject(error);
    }
  });
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
