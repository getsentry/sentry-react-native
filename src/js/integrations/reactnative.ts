import { addGlobalEventProcessor, getCurrentHub } from "@sentry/core";
import { Event, Integration } from "@sentry/types";
// import { ErrorUtils } from "react-native";

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
    addGlobalEventProcessor((event: Event) => {
      const self = getCurrentHub().getIntegration(ReactNative);
      if (self) {
        let handlingFatal = false;

        let defaultHandler =
          ErrorUtils.getGlobalHandler && ErrorUtils.getGlobalHandler();

        if (self._options.onunhandledrejection) {
          const tracking = require("promise/setimmediate/rejection-tracking");
          tracking.disable();
          tracking.enable({
            allRejections: true,
            onUnhandled: (_id: any, _error: any) => {
              // TODO
            },
            onHandled: function() {}
          });
        }

        if (self._options.onerror) {
          ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
            var error = arguments[0];
            if (isFatal) {
              // captureOptions.level = 'fatal';
              // TODO
            }
            // We want to handle fatals, but only in production mode.
            var shouldHandleFatal = isFatal && !global.__DEV__;
            if (shouldHandleFatal) {
              if (handlingFatal) {
                console.log(
                  "Encountered multiple fatals in a row. The latest:",
                  error
                );
                return;
              }
              handlingFatal = true;
              // We need to preserve the original error so that it can be rethrown
              // after it is persisted (see our shouldSendCallback above).
              // captureOptions[FATAL_ERROR_KEY] = error;
              // TODO
            }
            // Raven.captureException(error, captureOptions);
            // TODO
            // if (options.nativeClientAvailable) {
            //   // We always want to tunnel errors to the default handler
            //   Sentry._setInternalEventStored(() => {
            //     defaultHandler(error, isFatal);
            //   });
            // } else {
            //   // if we don't have a native
            //   defaultHandler(error, isFatal);
            // }
            defaultHandler(error, isFatal);
          });
        }
      }
      return event;
    });
  }
}
