import { addGlobalEventProcessor, getCurrentHub } from '@sentry/core';
import type { Event, EventHint, Integration, StackFrame } from '@sentry/types';
import { addContextToFrame, logger } from '@sentry/utils';

const INTERNAL_CALLSITES_REGEX = new RegExp(['ReactNativeRenderer-dev\\.js$', 'MessageQueue\\.js$'].join('|'));

interface GetDevServer {
  (): { url: string };
}

/**
 * React Native Stack Frame
 */
interface ReactNativeFrame {
  // arguments: []
  column: number;
  file: string;
  lineNumber: number;
  methodName: string;
}

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
  public setupOnce(): void {
    addGlobalEventProcessor(async (event: Event, hint: EventHint) => {
      const self = getCurrentHub().getIntegration(DebugSymbolicator);

      if (!self) {
        return event;
      }

      if (
        event.exception &&
        hint.originalException &&
        typeof hint.originalException === 'object' &&
        'stack' in hint.originalException &&
        typeof hint.originalException.stack === 'string'
      ) {
        // originalException is ErrorLike object
        const symbolicatedFrames = await this._symbolicate(hint.originalException.stack);
        symbolicatedFrames && this._replaceExceptionFramesInEvent(event, symbolicatedFrames);
      } else if (
        hint.syntheticException &&
        typeof hint.syntheticException === 'object' &&
        'stack' in hint.syntheticException &&
        typeof hint.syntheticException.stack === 'string'
      ) {
        // syntheticException is Error object
        const symbolicatedFrames = await this._symbolicate(hint.syntheticException.stack);

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
  private async _symbolicate(rawStack: string): Promise<StackFrame[] | null> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const parseErrorStack = require('react-native/Libraries/Core/Devtools/parseErrorStack');
    const parsedStack = parseErrorStack(rawStack);

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const symbolicateStackTrace = require('react-native/Libraries/Core/Devtools/symbolicateStackTrace');
      const prettyStack = await symbolicateStackTrace(parsedStack);

      if (!prettyStack) {
        logger.error('React Native DevServer could not symbolicate the stack trace.');
        return null;
      }

      // This has been changed in an react-native version so stack is contained in here
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const newStack = prettyStack.stack || prettyStack;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const stackWithoutInternalCallsites = newStack.filter(
        (frame: { file?: string }) =>
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          frame.file && frame.file.match(INTERNAL_CALLSITES_REGEX) === null,
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
  private async _convertReactNativeFramesToSentryFrames(frames: ReactNativeFrame[]): Promise<StackFrame[]> {
    let getDevServer: GetDevServer;
    try {
      getDevServer = require('react-native/Libraries/Core/Devtools/getDevServer');
    } catch (_oO) {
      // We can't load devserver URL
    }
    return Promise.all(
      frames.map(async (frame: ReactNativeFrame): Promise<StackFrame> => {
        let inApp = !!frame.column && !!frame.lineNumber;
        inApp =
          inApp &&
          frame.file !== undefined &&
          !frame.file.includes('node_modules') &&
          !frame.file.includes('native code');

        const newFrame: StackFrame = {
          lineno: frame.lineNumber,
          colno: frame.column,
          filename: frame.file,
          function: frame.methodName,
          in_app: inApp,
        };

        if (inApp) {
          await this._addSourceContext(newFrame, getDevServer);
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
  private _replaceExceptionFramesInEvent(event: Event, frames: StackFrame[]): void {
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
  private _replaceThreadFramesInEvent(event: Event, frames: StackFrame[]): void {
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
  private async _addSourceContext(frame: StackFrame, getDevServer?: GetDevServer): Promise<void> {
    let response;

    const segments = frame.filename?.split('/') ?? [];

    if (getDevServer) {
      for (const idx in segments) {
        if (Object.prototype.hasOwnProperty.call(segments, idx)) {
          response = await fetch(`${getDevServer().url}${segments.slice(-idx).join('/')}`, {
            method: 'GET',
          });

          if (response.ok) {
            break;
          }
        }
      }
    }

    if (response && response.ok) {
      const content = await response.text();
      const lines = content.split('\n');

      addContextToFrame(lines, frame);
    }
  }
}
