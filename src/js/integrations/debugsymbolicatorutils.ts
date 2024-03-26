import { ReactNativeLibraries } from '../utils/rnlibraries';
import { createStealthXhr, XHR_READYSTATE_DONE } from '../utils/xhr';
import type * as ReactNative from '../vendor/react-native';

/**
 * Get source context for segment
 */
export async function fetchSourceContext(url: string, segments: Array<string>, start: number): Promise<string | null> {
  return new Promise(resolve => {
    const fullUrl = `${url}${segments.slice(start).join('/')}`;

    const xhr = createStealthXhr();
    if (!xhr) {
      resolve(null);
      return;
    }

    xhr.open('GET', fullUrl, true);
    xhr.send();

    xhr.onreadystatechange = (): void => {
      if (xhr.readyState === XHR_READYSTATE_DONE) {
        if (xhr.status !== 200) {
          resolve(null);
        }
        const response = xhr.responseText;
        if (
          typeof response !== 'string' ||
          // Expo Dev Server responses with status 200 and config JSON
          // when web support not enabled and requested file not found
          response.startsWith('{')
        ) {
          resolve(null);
        }

        resolve(response);
      }
    };
    xhr.onerror = (): void => {
      resolve(null);
    };
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
