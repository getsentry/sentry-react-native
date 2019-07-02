import { getCurrentHub } from "@sentry/core";
import { Integration, Severity } from "@sentry/types";

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
  public static id: string = "ReactNative";

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

  private _handleUnhandledRejections(): void {
    if (this._options.onunhandledrejection) {
      const tracking = require("promise/setimmediate/rejection-tracking");
      tracking.disable();
      tracking.enable({
        allRejections: true,
        onUnhandled: (id: any, error: any) => {
          getCurrentHub().captureException(error, {
            data: { id },
            originalException: error
          });
        },
        onHandled: function() {}
      });
    }
  }

  private _handleOnError(): void {
    if (this._options.onerror) {
      let handlingFatal = false;

      let defaultHandler =
        ErrorUtils.getGlobalHandler && ErrorUtils.getGlobalHandler();

      ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
        // We want to handle fatals, but only in production mode.
        const shouldHandleFatal = isFatal && !global.__DEV__;
        if (shouldHandleFatal) {
          if (handlingFatal) {
            console.log(
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

        const client = getCurrentHub().getClient();
        if (client) {
          client.flush(2000).then(() => {
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
