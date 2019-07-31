import { addGlobalEventProcessor, getCurrentHub } from "@sentry/core";
import { Event, EventHint, Integration, StackFrame } from "@sentry/types";
import { logger } from "@sentry/utils";

const INTERNAL_CALLSITES_REGEX = new RegExp(
  [
    "/Libraries/Renderer/oss/ReactNativeRenderer-dev\\.js$",
    "/Libraries/BatchedBridge/MessageQueue\\.js$"
  ].join("|")
);

interface ReactNativeFrame {
  // arguments: []
  column: number;
  file: string;
  lineNumber: number;
  methodName: string;
}

/** Tries to symbolicate the JS stack trace on the device. */
export class DebugSymbolicator implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = DebugSymbolicator.id;
  /**
   * @inheritDoc
   */
  public static id: string = "DebugSymbolicator";

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    addGlobalEventProcessor(async (event: Event, hint?: EventHint) => {
      const self = getCurrentHub().getIntegration(DebugSymbolicator);
      if ((!self && !__DEV__) || hint === undefined) {
        return event;
      }

      const parseErrorStack = require("react-native/Libraries/Core/Devtools/parseErrorStack");
      const stack = parseErrorStack(hint.originalException);

      const symbolicateStackTrace = require("react-native/Libraries/Core/Devtools/symbolicateStackTrace");

      try {
        const prettyStack = await symbolicateStackTrace(stack);
        if (prettyStack) {
          const stackWithoutInternalCallsites = prettyStack.filter(
            (frame: any) =>
              frame.file && frame.file.match(INTERNAL_CALLSITES_REGEX) === null
          );

          // Below you will find lines marked with :HACK to prevent showing errors in the sentry ui
          // But since this is a debug only feature: This is Fine (TM)

          const symbolicatedFrames = stackWithoutInternalCallsites.map(
            (frame: ReactNativeFrame): StackFrame => {
              const inApp = !frame.file.includes("node_modules");

              return {
                colno: frame.column,
                filename: frame.file,
                function: frame.methodName,
                in_app: inApp,
                lineno: inApp ? frame.lineNumber : undefined, // :HACK
                platform: inApp ? "javascript" : "node" // :HACK
              };
            }
          );

          event.platform = "node"; // :HACK

          if (
            event.exception &&
            event.exception.values &&
            event.exception.values[0] &&
            event.exception.values[0].stacktrace
          ) {
            event.exception.values[0].stacktrace.frames = symbolicatedFrames.reverse();
          }

          console.log(symbolicatedFrames);
        } else {
          logger.error("The stack is null");
        }
      } catch (error) {
        logger.warn(`Unable to symbolicate stack trace: ${error.message}`);
      }

      return event;
    });
  }
}
