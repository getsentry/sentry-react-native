import { getCurrentHub } from '@sentry/core';
import type { EventHint, Integration, SeverityLevel } from '@sentry/types';
import { addExceptionMechanism, logger } from '@sentry/utils';

import type { ReactNativeClient } from '../client';
import { RN_GLOBAL_OBJ } from '../utils/worldwide';

/** ReactNativeErrorHandlers Options */
interface ReactNativeErrorHandlersOptions {
  onerror: boolean;
  onunhandledrejection: boolean;
  patchGlobalPromise: boolean;
}

interface PromiseRejectionTrackingOptions {
  onUnhandled: (id: string, error: unknown) => void;
  onHandled: (id: string) => void;
}

/** ReactNativeErrorHandlers Integration */
export class ReactNativeErrorHandlers implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'ReactNativeErrorHandlers';

  /**
   * @inheritDoc
   */
  public name: string = ReactNativeErrorHandlers.id;

  /** ReactNativeOptions */
  private readonly _options: ReactNativeErrorHandlersOptions;

  /** Constructor */
  public constructor(options?: Partial<ReactNativeErrorHandlersOptions>) {
    this._options = {
      onerror: true,
      onunhandledrejection: true,
      patchGlobalPromise: true,
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
      if (this._options.patchGlobalPromise) {
        this._polyfillPromise();
      }

      this._attachUnhandledRejectionHandler();
      this._checkPromiseAndWarn();
    }
  }
  /**
   * Polyfill the global promise instance with one we can be sure that we can attach the tracking to.
   *
   * In newer RN versions >=0.63, the global promise is not the same reference as the one imported from the promise library.
   * This is due to a version mismatch between promise versions.
   * Originally we tried a solution where we would have you put a package resolution to ensure the promise instances match. However,
   * - Using a package resolution requires the you to manually troubleshoot.
   * - The package resolution fix no longer works with 0.67 on iOS Hermes.
   */
  private _polyfillPromise(): void {
    /* eslint-disable import/no-extraneous-dependencies,@typescript-eslint/no-var-requires */
    const { polyfillGlobal } = require('react-native/Libraries/Utilities/PolyfillFunctions');

    const Promise = this._getPromisePolyfill();

    // As of RN 0.67 only done and finally are used
    require('promise/setimmediate/done');
    require('promise/setimmediate/finally');

    polyfillGlobal('Promise', () => Promise);
    /* eslint-enable import/no-extraneous-dependencies,@typescript-eslint/no-var-requires */
  }

  /**
   * Single source of truth for the Promise implementation we want to use.
   * This is important for verifying that the rejected promise tracing will work as expected.
   */
  private _getPromisePolyfill(): unknown {
    /* eslint-disable import/no-extraneous-dependencies,@typescript-eslint/no-var-requires */
    // Below, we follow the exact way React Native initializes its promise library, and we globally replace it.
    return require('promise/setimmediate/es6-extensions');
  }

  /**
   * Attach the unhandled rejection handler
   */
  private _attachUnhandledRejectionHandler(): void {
    const tracking: {
      disable: () => void;
      enable: (arg: unknown) => void;
      // eslint-disable-next-line import/no-extraneous-dependencies,@typescript-eslint/no-var-requires
    } = require('promise/setimmediate/rejection-tracking');

    const promiseRejectionTrackingOptions: PromiseRejectionTrackingOptions = {
      onUnhandled: (id, rejection = {}) => {
        // eslint-disable-next-line no-console
        console.warn(`Possible Unhandled Promise Rejection (id: ${id}):\n${rejection}`);
      },
      onHandled: id => {
        // eslint-disable-next-line no-console
        console.warn(
          `Promise Rejection Handled (id: ${id})\n` +
            'This means you can ignore any previous messages of the form ' +
            `"Possible Unhandled Promise Rejection (id: ${id}):"`,
        );
      },
    };

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
  }
  /**
   * Checks if the promise is the same one or not, if not it will warn the user
   */
  private _checkPromiseAndWarn(): void {
    try {
      // `promise` package is a dependency of react-native, therefore it is always available.
      // but it is possible that the user has installed a different version of promise
      // or dependency that uses a different version.
      // We have to check if the React Native Promise and the `promise` package Promise are using the same reference.
      // If they are not, likely there are multiple versions of the `promise` package installed.
      // eslint-disable-next-line @typescript-eslint/no-var-requires,import/no-extraneous-dependencies
      const ReactNativePromise = require('react-native/Libraries/Promise');
      // eslint-disable-next-line @typescript-eslint/no-var-requires,import/no-extraneous-dependencies
      const PromisePackagePromise = require('promise/setimmediate/es6-extensions');
      const UsedPromisePolyfill = this._getPromisePolyfill();

      if (ReactNativePromise !== PromisePackagePromise) {
        logger.warn(
          'You appear to have multiple versions of the "promise" package installed. ' +
            'This may cause unexpected behavior like undefined `Promise.allSettled`. ' +
            'Please install the `promise` package manually using the exact version as the React Native package. ' +
            'See https://docs.sentry.io/platforms/react-native/troubleshooting/ for more details.',
        );
      }

      // This only make sense if the user disabled the integration Polyfill
      if (UsedPromisePolyfill !== RN_GLOBAL_OBJ.Promise) {
        logger.warn(
          'Unhandled promise rejections will not be caught by Sentry. ' +
            'See https://docs.sentry.io/platforms/react-native/troubleshooting/ for more details.',
        );
      } else {
        logger.log('Unhandled promise rejections will be caught by Sentry.');
      }
    } catch (e) {
      // Do Nothing
      logger.warn(
        'Unhandled promise rejections will not be caught by Sentry. ' +
          'See https://docs.sentry.io/platforms/react-native/troubleshooting/ for more details.',
      );
    }
  }
  /**
   * Handle errors
   */
  private _handleOnError(): void {
    if (this._options.onerror) {
      let handlingFatal = false;

      const errorUtils = RN_GLOBAL_OBJ.ErrorUtils;
      if (!errorUtils) {
        logger.warn('ErrorUtils not found. Can be caused by different environment for example react-native-web.');
        return;
      }

      const defaultHandler = errorUtils.getGlobalHandler && errorUtils.getGlobalHandler();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      errorUtils.setGlobalHandler(async (error: any, isFatal?: boolean) => {
        // We want to handle fatals, but only in production mode.
        const shouldHandleFatal = isFatal && !__DEV__;
        if (shouldHandleFatal) {
          if (handlingFatal) {
            logger.log('Encountered multiple fatals in a row. The latest:', error);
            return;
          }
          handlingFatal = true;
        }

        const currentHub = getCurrentHub();
        const client = currentHub.getClient<ReactNativeClient>();
        const scope = currentHub.getScope();

        if (!client) {
          logger.error('Sentry client is missing, the error event might be lost.', error);

          // If there is no client something is fishy, anyway we call the default handler
          defaultHandler(error, isFatal);

          return;
        }

        const options = client.getOptions();

        const hint: EventHint = {
          originalException: error,
          attachments: scope?.getAttachments(),
        };
        const event = await client.eventFromException(error, hint);

        if (isFatal) {
          event.level = 'fatal' as SeverityLevel;

          addExceptionMechanism(event, {
            handled: false,
            type: 'onerror',
          });
        }

        currentHub.captureEvent(event, hint);

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
