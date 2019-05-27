import { addGlobalEventProcessor, getCurrentHub } from "@sentry/core";
import { Event, Integration, Severity } from "@sentry/types";
// import { NativeModules } from "react-native";

// const { RNSentry } = NativeModules;

// import { normalizeData } from '../normalize';

/** JSDoc */
interface ReactNativeOptions {
  onerror: boolean;
  onunhandledrejection: boolean;
}

declare const global: any;

/** ReactNative Integration */
export class ReactNative implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = ReactNative.id;

  /**
   * @inheritDoc
   */
  public static id: string = "ReactNative";

  /** JSDoc */
  private readonly _options: ReactNativeOptions;

  /** JSDoc */
  public constructor(options?: ReactNativeOptions) {
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

    addGlobalEventProcessor((event: Event) => {
      const self = getCurrentHub().getIntegration(ReactNative);
      if (self) {
        // getCurrentHub().configureScope(scope => {
        //   scope.addScopeListener();
        // });
      }
      return event;
    });
  }

  /**
   * Extract key/value pairs from an object and encode them for
   * use in a query string
   */
  //  private urlencode(obj) {
  //    var pairs = [];
  //    for (var key in obj) {
  //      if ({}.hasOwnProperty.call(obj, key))
  //        pairs.push(
  //          encodeURIComponent(key) + "=" + encodeURIComponent(obj[key])
  //        );
  //    }
  //    return pairs.join("&");
  //  }

  private _handleUnhandledRejections(): void {
    if (this._options.onunhandledrejection) {
      const tracking = require("promise/setimmediate/rejection-tracking");
      tracking.disable();
      tracking.enable({
        allRejections: true,
        onUnhandled: (id: any, error: any) => {
          console.log(id, error);
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
        }
      });
    }
  }
}
