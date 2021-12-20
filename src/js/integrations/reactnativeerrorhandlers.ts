import { eventFromException } from "@sentry/browser";
import { getCurrentHub } from "@sentry/core";
import { Integration, Severity } from "@sentry/types";
import { addExceptionMechanism, logger } from "@sentry/utils";

import { ReactNativeClient } from "../client";

/** ReactNativeErrorHandlers Options */
interface ReactNativeErrorHandlersOptions {
  onerror: boolean;
  onunhandledrejection: boolean;
}

interface PromiseRejectionTrackingOptions {
  onUnhandled: (id: string, error: unknown) => void;
  onHandled: (id: string) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const global: any;

/** ReactNativeErrorHandlers Integration */
export class ReactNativeErrorHandlers implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = "ReactNativeErrorHandlers";

  /**
   * @inheritDoc
   */
  public name: string = ReactNativeErrorHandlers.id;

  /** ReactNativeOptions */
  private readonly _options: ReactNativeErrorHandlersOptions;

  /** Constructor */
  public constructor(options?: ReactNativeErrorHandlersOptions) {
    this._options = {
      onerror: true,
      onunhandledrejection: true,
      ...options,
    };
  }

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    this._handleUnhandledRejections();
    this._handleOnError();
  }

  /**
   * Handle Promises
   */
  private _handleUnhandledRejections(): void {
    if (this._options.onunhandledrejection) {
      /*
        In newer RN versions >=0.63, the global promise is not the same reference as the one imported from the promise library.
        This is due to a version mismatch between promise versions.
      */
      this._polyfillPromise();
    }
  }
  /**
   * Polyfill the global promise instance with one we can be sure that we can attach the tracking to.
   */
  private _polyfillPromise(): void {
    /* eslint-disable import/no-extraneous-dependencies,@typescript-eslint/no-var-requires*/
    const {
      polyfillGlobal,
    } = require("react-native/Libraries/Utilities/PolyfillFunctions");
    const Promise = require("promise/setimmediate/es6-extensions");

    require("promise/setimmediate/done");
    require("promise/setimmediate/finally");

    polyfillGlobal("Promise", () => {
      const tracking: {
        disable: () => void;
        enable: (arg: unknown) => void;
      } = require("promise/setimmediate/rejection-tracking");

      const promiseRejectionTrackingOptions = this._getPromiseRejectionTrackingOptions();

      tracking.disable();
      tracking.enable({
        allRejections: true,
        onUnhandled: (id: string, error: Error) => {
          if (__DEV__) {
            promiseRejectionTrackingOptions.onUnhandled(id, error);
          }

          getCurrentHub().captureException(error, {
            data: { id },
            originalException: error,
          });
        },
        onHandled: (id: string) => {
          promiseRejectionTrackingOptions.onHandled(id);
        },
      });

      return Promise;
      /* eslint-enable import/no-extraneous-dependencies,@typescript-eslint/no-var-requires */
    });
  }
  /**
   * Gets the promise rejection handlers, tries to get React Native's default one but otherwise will default to console.logging unhandled rejections.
   */
  private _getPromiseRejectionTrackingOptions(): PromiseRejectionTrackingOptions {
    return {
      onUnhandled: (id, rejection = {}) => {
        // eslint-disable-next-line no-console
        console.warn(
          `Possible Unhandled Promise Rejection (id: ${id}):\n${rejection}`
        );
      },
      onHandled: (id) => {
        // eslint-disable-next-line no-console
        console.warn(
          `Promise Rejection Handled (id: ${id})\n` +
            "This means you can ignore any previous messages of the form " +
            `"Possible Unhandled Promise Rejection (id: ${id}):"`
        );
      },
    };
  }
  /**
   * Handle errors
   */
  private _handleOnError(): void {
    if (this._options.onerror) {
      let handlingFatal = false;

      const defaultHandler =
        ErrorUtils.getGlobalHandler && ErrorUtils.getGlobalHandler();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ErrorUtils.setGlobalHandler(async (error: any, isFatal?: boolean) => {
        // We want to handle fatals, but only in production mode.
        const shouldHandleFatal = isFatal && !__DEV__;
        if (shouldHandleFatal) {
          if (handlingFatal) {
            logger.log(
              "Encountered multiple fatals in a row. The latest:",
              error
            );
            return;
          }
          handlingFatal = true;
        }

        const currentHub = getCurrentHub();
        const client = currentHub.getClient<ReactNativeClient>();

        if (!client) {
          logger.error(
            "Sentry client is missing, the error event might be lost.",
            error
          );

          // If there is no client something is fishy, anyway we call the default handler
          defaultHandler(error, isFatal);

          return;
        }

        const options = client.getOptions();

        const event = await eventFromException(options, error, {
          originalException: error,
        });

        if (isFatal) {
          event.level = Severity.Fatal;

          addExceptionMechanism(event, {
            handled: false,
            type: "onerror",
          });
        }

        currentHub.captureEvent(event);

        if (!__DEV__) {
          void client.flush(options.shutdownTimeout || 2000).then(() => {
            defaultHandler(error, isFatal);
          });
        } else {
          // If in dev, we call the default handler anyway and hope the error will be sent
          // Just for a better dev experience
          defaultHandler(error, isFatal);
        }
      });
    }
  }
}
