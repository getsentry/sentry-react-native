import { getCurrentHub } from "@sentry/core";
import { Integration, Severity } from "@sentry/types";
import { getGlobalObject, logger } from "@sentry/utils";

import { ReactNativeClient } from "../client";

/** ReactNativeErrorHandlers Options */
interface ReactNativeErrorHandlersOptions {
  onerror: boolean;
  onunhandledrejection: boolean;
}

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
      const tracking: {
        disable: () => void;
        enable: (arg: unknown) => void;
        // eslint-disable-next-line @typescript-eslint/no-var-requires,import/no-extraneous-dependencies
      } = require("promise/setimmediate/rejection-tracking");

      tracking.disable();
      tracking.enable({
        allRejections: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onUnhandled: (id: any, error: any) => {
          if (__DEV__) {
            // We mimic the behavior of unhandled promise rejections showing up as a warning.
            // eslint-disable-next-line no-console
            console.warn(id, error);
          }
          getCurrentHub().captureException(error, {
            data: { id },
            originalException: error,
          });
        },
      });

      /* eslint-disable
        @typescript-eslint/no-var-requires,
        import/no-extraneous-dependencies,
        @typescript-eslint/no-explicit-any,
        @typescript-eslint/no-unsafe-member-access
      */
      const Promise = require("promise/setimmediate/core");
      const _global = getGlobalObject<any>();

      /* In newer RN versions >=0.63, the global promise is not the same reference as the one imported from the promise library.
        Due to this, we need to take the methods that tracking.enable sets, and then set them on the global promise.
        Note: We do not want to overwrite the whole promise in case there are extensions present.

        If the global promise is the same as the imported promise (expected in RN <0.63), we do nothing.
      */
      const _onHandle = Promise._onHandle ?? Promise._Y;
      const _onReject = Promise._onReject ?? Promise._Z;

      if (
        Promise !== _global.Promise &&
        typeof _onHandle !== "undefined" &&
        typeof _onReject !== "undefined"
      ) {
        if ("_onHandle" in _global.Promise && "_onReject" in _global.Promise) {
          _global.Promise._onHandle = _onHandle;
          _global.Promise._onReject = _onReject;
        } else if ("_Y" in _global.Promise && "_Z" in _global.Promise) {
          _global.Promise._Y = _onHandle;
          _global.Promise._Z = _onReject;
        }
      }
      /* eslint-enable
        @typescript-eslint/no-var-requires,
        import/no-extraneous-dependencies,
        @typescript-eslint/no-explicit-any,
        @typescript-eslint/no-unsafe-member-access
      */
    }
  }
  /**
   * Handle erros
   */
  private _handleOnError(): void {
    if (this._options.onerror) {
      let handlingFatal = false;

      const defaultHandler =
        ErrorUtils.getGlobalHandler && ErrorUtils.getGlobalHandler();

      ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
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

        getCurrentHub().withScope((scope) => {
          if (isFatal) {
            scope.setLevel(Severity.Fatal);
          }
          getCurrentHub().captureException(error, {
            originalException: error,
          });
        });

        const client = getCurrentHub().getClient<ReactNativeClient>();
        // If in dev, we call the default handler anyway and hope the error will be sent
        // Just for a better dev experience
        if (client && !__DEV__) {
          void client
            .flush(client.getOptions().shutdownTimeout || 2000)
            .then(() => {
              defaultHandler(error, isFatal);
            });
        } else {
          // If there is no client something is fishy, anyway we call the default handler
          defaultHandler(error, isFatal);
        }
      });
    }
  }
}
