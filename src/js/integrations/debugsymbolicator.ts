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
    addGlobalEventProcessor(async (event: Event, hint?: EventHint) => {
      const self = getCurrentHub().getIntegration(DebugSymbolicator);

      if (!self || hint === undefined || hint.originalException === undefined) {
        return event;
      }

      const reactError = hint.originalException as ReactNativeError;

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const parseErrorStack = require('react-native/Libraries/Core/Devtools/parseErrorStack');

      let stack;
      try {
        stack = parseErrorStack(reactError);
      } catch (e) {
        // In RN 0.64 `parseErrorStack` now only takes a string
        stack = parseErrorStack(reactError.stack);
      }

      await self._symbolicate(event, stack);

      return event;
    });
  }

  /**
   * Symbolicates the stack on the device talking to local dev server.
   * Mutates the passed event.
   */
  private async _symbolicate(event: Event, stack: string | undefined): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const symbolicateStackTrace = require('react-native/Libraries/Core/Devtools/symbolicateStackTrace');
      const prettyStack = await symbolicateStackTrace(stack);

      if (prettyStack) {
        let newStack = prettyStack;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (prettyStack.stack) {
          // This has been changed in an react-native version so stack is contained in here
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          newStack = prettyStack.stack;
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const stackWithoutInternalCallsites = newStack.filter(
          (frame: { file?: string }) =>
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            frame.file && frame.file.match(INTERNAL_CALLSITES_REGEX) === null,
        );

        const symbolicatedFrames = await this._convertReactNativeFramesToSentryFrames(stackWithoutInternalCallsites);
        this._replaceFramesInEvent(event, symbolicatedFrames);
      } else {
        logger.error('The stack is null');
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.warn(`Unable to symbolicate stack trace: ${error.message}`);
      }
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

        // The upstream `react-native@0.61` delegates parsing of stacks to `stacktrace-parser`, which is buggy and
        // leaves a trailing `(address at` in the function name.
        // `react-native@0.62` seems to have custom logic to parse hermes frames specially.
        // Anyway, all we do here is throw away the bogus suffix.
        if (newFrame.function) {
          const addressAtPos = newFrame.function.indexOf('(address at');
          if (addressAtPos >= 0) {
            newFrame.function = newFrame.function.substring(0, addressAtPos).trim();
          }
        }

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
  private _replaceFramesInEvent(event: Event, frames: StackFrame[]): void {
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
