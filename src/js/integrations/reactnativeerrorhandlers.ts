import { getCurrentHub } from "@sentry/core";
import { Integration, Severity } from "@sentry/types";
import { logger } from "@sentry/utils";

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
  public name: string = ReactNativeErrorHandlers.id;

  /**
   * @inheritDoc
   */
  public static id: string = "ReactNativeErrorHandlers";

  /** ReactNativeOptions */
  private readonly _options: ReactNativeErrorHandlersOptions;

  /** Constructor */
  public constructor(options?: ReactNativeErrorHandlersOptions) {
    this._options = {
      onerror: true,
      onunhandledrejection: true,
      ...options
    };
  }

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    this._handleUnhandledRejections();
    this._handleOnError();
  }

  // tslint:disable: no-unsafe-any

  /**
   * Handle Promises
   */
  private _handleUnhandledRejections(): void {
    if (this._options.onunhandledrejection) {
      // tslint:disable-next-line: no-implicit-dependencies
      const tracking = require("promise/setimmediate/rejection-tracking");
      tracking.disable();
      tracking.enable({
        allRejections: true,
        onHandled: () => {
          // We do nothing
        },
        onUnhandled: (id: any, error: any) => {
          if (__DEV__) {
            console.warn(id, error);
          }
          getCurrentHub().captureException(error, {
            data: { id },
            originalException: error
          });
        }
      });
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
        const shouldHandleFatal = isFatal && !global.__DEV__;
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

        getCurrentHub().withScope(scope => {
          if (isFatal) {
            scope.setLevel(Severity.Fatal);
          }
          getCurrentHub().captureException(error, {
            originalException: error
          });
        });

        const client = getCurrentHub().getClient<ReactNativeClient>();
        // If in dev, we call the default handler anyway and hope the error will be sent
        // Just for a better dev experience
        if (client && !__DEV__) {
          client.flush(client.getOptions().shutdownTimeout || 2000).then(() => {
            defaultHandler(error, isFatal);
          });
        } else {
          // If there is no client something is fishy, anyway we call the default handler
          defaultHandler(error, isFatal);
        }
      });
    }
  }

  // tslint:enable: no-unsafe-any
}
