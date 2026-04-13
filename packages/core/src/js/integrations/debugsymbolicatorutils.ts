import type { StackFrame as SentryStackFrame } from '@sentry/core';

import { debug, parseStackFrames } from '@sentry/core';
import { defaultStackParser } from '@sentry/react';

import type * as ReactNative from '../vendor/react-native';

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

  return `${devServer.url}__sentry/context`;
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
