import type { Event, EventHint, EventProcessor, Hub, Integration, StackFrame as SentryStackFrame } from '@sentry/types';
import { addContextToFrame, logger } from '@sentry/utils';

import { getFramesToPop, isErrorLike } from '../utils/error';
import { ReactNativeLibraries } from '../utils/rnlibraries';
import { createStealthXhr, XHR_READYSTATE_DONE } from '../utils/xhr';
import type * as ReactNative from '../vendor/react-native';

const INTERNAL_CALLSITES_REGEX = new RegExp(['ReactNativeRenderer-dev\\.js$', 'MessageQueue\\.js$'].join('|'));

/**
 * React Native Error
 */
export type ReactNativeError = Error & {
  framesToPop?: number;
  jsEngine?: string;
  preventSymbolication?: boolean;
  componentStack?: string;
};

/** Tries to symbolicate the JS stack trace on the device. */
export class DebugSymbolicator implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'DebugSymbolicator';
  /**
   * @inheritDoc
   */
  public name: string = DebugSymbolicator.id;

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    addGlobalEventProcessor(async (event: Event, hint: EventHint) => {
      const self = getCurrentHub().getIntegration(DebugSymbolicator);

      if (!self) {
        return event;
      }

      if (event.exception && isErrorLike(hint.originalException)) {
        // originalException is ErrorLike object
        const symbolicatedFrames = await this._symbolicate(
          hint.originalException.stack,
          getFramesToPop(hint.originalException as Error),
        );
        symbolicatedFrames && this._replaceExceptionFramesInEvent(event, symbolicatedFrames);
      } else if (hint.syntheticException && isErrorLike(hint.syntheticException)) {
        // syntheticException is Error object
        const symbolicatedFrames = await this._symbolicate(
          hint.syntheticException.stack,
          getFramesToPop(hint.syntheticException),
        );

        if (event.exception) {
          symbolicatedFrames && this._replaceExceptionFramesInEvent(event, symbolicatedFrames);
        } else if (event.threads) {
          // RN JS doesn't have threads
          // syntheticException is used for Sentry.captureMessage() threads
          symbolicatedFrames && this._replaceThreadFramesInEvent(event, symbolicatedFrames);
        }
      }

      return event;
    });
  }

  /**
   * Symbolicates the stack on the device talking to local dev server.
   * Mutates the passed event.
   */
  private async _symbolicate(rawStack: string, skipFirstFrames: number = 0): Promise<SentryStackFrame[] | null> {
    try {
      const parsedStack = this._parseErrorStack(rawStack);

      const prettyStack = await this._symbolicateStackTrace(parsedStack);
      if (!prettyStack) {
        logger.error('React Native DevServer could not symbolicate the stack trace.');
        return null;
      }

      // This has been changed in an react-native version so stack is contained in here
      const newStack = prettyStack.stack || prettyStack;

      // https://github.com/getsentry/sentry-javascript/blob/739d904342aaf9327312f409952f14ceff4ae1ab/packages/utils/src/stacktrace.ts#L23
      // Match SentryParser which counts lines of stack (-1 for first line with the Error message)
      const skipFirstAdjustedToSentryStackParser = Math.max(skipFirstFrames - 1, 0);
      const stackWithoutPoppedFrames = skipFirstAdjustedToSentryStackParser
        ? newStack.slice(skipFirstAdjustedToSentryStackParser)
        : newStack;

      const stackWithoutInternalCallsites = stackWithoutPoppedFrames.filter(
        (frame: { file?: string }) => frame.file && frame.file.match(INTERNAL_CALLSITES_REGEX) === null,
      );

      return await this._convertReactNativeFramesToSentryFrames(stackWithoutInternalCallsites);
    } catch (error) {
      if (error instanceof Error) {
        logger.warn(`Unable to symbolicate stack trace: ${error.message}`);
      }
      return null;
    }
  }

  /**
   * Converts ReactNativeFrames to frames in the Sentry format
   * @param frames ReactNativeFrame[]
   */
  private async _convertReactNativeFramesToSentryFrames(frames: ReactNative.StackFrame[]): Promise<SentryStackFrame[]> {
    return Promise.all(
      frames.map(async (frame: ReactNative.StackFrame): Promise<SentryStackFrame> => {
        let inApp = !!frame.column && !!frame.lineNumber;
        inApp =
          inApp &&
          frame.file !== undefined &&
          !frame.file.includes('node_modules') &&
          !frame.file.includes('native code');

        const newFrame: SentryStackFrame = {
          lineno: frame.lineNumber,
          colno: frame.column,
          filename: frame.file,
          function: frame.methodName,
          in_app: inApp,
        };

        if (inApp) {
          await this._addSourceContext(newFrame);
        }

        return newFrame;
      }),
    );
  }

  /**
   * Replaces the frames in the exception of a error.
   * @param event Event
   * @param frames StackFrame[]
   */
  private _replaceExceptionFramesInEvent(event: Event, frames: SentryStackFrame[]): void {
    if (
      event.exception &&
      event.exception.values &&
      event.exception.values[0] &&
      event.exception.values[0].stacktrace
    ) {
      event.exception.values[0].stacktrace.frames = frames.reverse();
    }
  }

  /**
   * Replaces the frames in the thread of a message.
   * @param event Event
   * @param frames StackFrame[]
   */
  private _replaceThreadFramesInEvent(event: Event, frames: SentryStackFrame[]): void {
    if (event.threads && event.threads.values && event.threads.values[0] && event.threads.values[0].stacktrace) {
      event.threads.values[0].stacktrace.frames = frames.reverse();
    }
  }

  /**
   * This tries to add source context for in_app Frames
   *
   * @param frame StackFrame
   * @param getDevServer function from RN to get DevServer URL
   */
  private async _addSourceContext(frame: SentryStackFrame): Promise<void> {
    let sourceContext: string | null = null;

    const segments = frame.filename?.split('/') ?? [];

    const serverUrl = this._getDevServer()?.url;
    if (!serverUrl) {
      return;
    }

    for (const idx in segments) {
      if (!Object.prototype.hasOwnProperty.call(segments, idx)) {
        continue;
      }

      sourceContext = await this._fetchSourceContext(serverUrl, segments, -idx);
      if (sourceContext) {
        break;
      }
    }

    if (!sourceContext) {
      return;
    }

    const lines = sourceContext.split('\n');
    addContextToFrame(lines, frame);
  }

  /**
   * Get source context for segment
   */
  private async _fetchSourceContext(url: string, segments: Array<string>, start: number): Promise<string | null> {
    return new Promise((resolve) => {
      const fullUrl = `${url}${segments.slice(start).join('/')}`;

      const xhr = createStealthXhr();
      xhr.open('GET', fullUrl, true);
      xhr.send();

      xhr.onreadystatechange = (): void => {
        if (xhr.readyState === XHR_READYSTATE_DONE) {
          if (xhr.status !== 200) {
            resolve(null);
          }
          resolve(xhr.responseText);
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
  private _parseErrorStack(errorStack: string): Array<ReactNative.StackFrame> {
    if (!ReactNativeLibraries.Devtools) {
      throw new Error('React Native Devtools not available.');
    }
    return ReactNativeLibraries.Devtools.parseErrorStack(errorStack);
  }

  /**
   * Loads and calls RN Core Devtools symbolicateStackTrace function.
   */
  private _symbolicateStackTrace(
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
  private _getDevServer(): ReactNative.DevServerInfo | undefined {
    try {
      return ReactNativeLibraries.Devtools?.getDevServer();
    } catch (_oO) {
      // We can't load devserver URL
    }
    return undefined;
  }
}
