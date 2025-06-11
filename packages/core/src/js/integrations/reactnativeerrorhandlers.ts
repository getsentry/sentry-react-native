import type { EventHint, Integration, SeverityLevel } from '@sentry/core';
import {
  addExceptionMechanism,
  addGlobalUnhandledRejectionInstrumentationHandler,
  captureException,
  getClient,
  getCurrentScope,
  logger,
} from '@sentry/core';

import { isHermesEnabled, isWeb } from '../utils/environment';
import { createSyntheticError, isErrorLike } from '../utils/error';
import { RN_GLOBAL_OBJ } from '../utils/worldwide';
import { checkPromiseAndWarn, polyfillPromise, requireRejectionTracking } from './reactnativeerrorhandlersutils';

const INTEGRATION_NAME = 'ReactNativeErrorHandlers';

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
export const reactNativeErrorHandlersIntegration = (
  options: Partial<ReactNativeErrorHandlersOptions> = {},
): Integration => {
  return {
    name: INTEGRATION_NAME,
    setupOnce: () =>
      setup({
        onerror: true,
        onunhandledrejection: true,
        patchGlobalPromise: true,
        ...options,
      }),
  };
};

function setup(options: ReactNativeErrorHandlersOptions): void {
  options.onunhandledrejection && setupUnhandledRejectionsTracking(options.patchGlobalPromise);
  options.onerror && setupErrorUtilsGlobalHandler();
}

/**
 * Setup unhandled promise rejection tracking
 */
function setupUnhandledRejectionsTracking(patchGlobalPromise: boolean): void {
  try {
    if (
      isHermesEnabled() &&
      RN_GLOBAL_OBJ.HermesInternal?.enablePromiseRejectionTracker &&
      RN_GLOBAL_OBJ?.HermesInternal?.hasPromise?.()
    ) {
      logger.log('Using Hermes native promise rejection tracking');

      RN_GLOBAL_OBJ.HermesInternal.enablePromiseRejectionTracker({
        allRejections: true,
        onUnhandled: promiseRejectionTrackingOptions.onUnhandled,
        onHandled: promiseRejectionTrackingOptions.onHandled,
      });

      logger.log('Unhandled promise rejections will be caught by Sentry.');
    } else if (isWeb()) {
      logger.log('Using Browser JS promise rejection tracking for React Native Web');

      // Use Sentry's built-in global unhandled rejection handler
      addGlobalUnhandledRejectionInstrumentationHandler((error: unknown) => {
        captureException(error, {
          originalException: error,
          syntheticException: isErrorLike(error) ? undefined : createSyntheticError(),
          mechanism: { handled: false, type: 'onunhandledrejection' },
        });
      });
    } else if (patchGlobalPromise) {
      // For JSC and other environments, use the existing approach
      polyfillPromise();
      attachUnhandledRejectionHandler();
      checkPromiseAndWarn();
    } else {
      // For JSC and other environments, patching was disabled by user configuration
      logger.log('Unhandled promise rejections will not be caught by Sentry.');
    }
  } catch (e) {
    logger.warn(
      'Failed to set up promise rejection tracking. ' +
        'Unhandled promise rejections will not be caught by Sentry.' +
        'See https://docs.sentry.io/platforms/react-native/troubleshooting/ for more details.',
    );
  }
}

const promiseRejectionTrackingOptions: PromiseRejectionTrackingOptions = {
  onUnhandled: (id, error: unknown, rejection = {}) => {
    if (__DEV__) {
      logger.warn(`Possible Unhandled Promise Rejection (id: ${id}):\n${rejection}`);
    }

    // Marking the rejection as handled to avoid breaking crash rate calculations.
    // See: https://github.com/getsentry/sentry-react-native/issues/4141
    captureException(error, {
      data: { id },
      originalException: error,
      syntheticException: isErrorLike(error) ? undefined : createSyntheticError(),
      mechanism: { handled: true, type: 'onunhandledrejection' },
    });
  },
  onHandled: id => {
    if (__DEV__) {
      logger.warn(
        `Promise Rejection Handled (id: ${id})\n` +
          'This means you can ignore any previous messages of the form ' +
          `"Possible Unhandled Promise Rejection (id: ${id}):"`,
      );
    }
  },
};

function attachUnhandledRejectionHandler(): void {
  const tracking = requireRejectionTracking();

  tracking.enable({
    allRejections: true,
    onUnhandled: promiseRejectionTrackingOptions.onUnhandled,
    onHandled: promiseRejectionTrackingOptions.onHandled,
  });
}

function setupErrorUtilsGlobalHandler(): void {
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

    const client = getClient();

    if (!client) {
      logger.error('Sentry client is missing, the error event might be lost.', error);

      // If there is no client something is fishy, anyway we call the default handler
      defaultHandler(error, isFatal);

      return;
    }

    const hint: EventHint = {
      originalException: error,
      attachments: getCurrentScope().getScopeData().attachments,
    };
    const event = await client.eventFromException(error, hint);

    if (isFatal) {
      event.level = 'fatal' as SeverityLevel;

      addExceptionMechanism(event, {
        handled: false,
        type: 'onerror',
      });
    } else {
      event.level = 'error';

      addExceptionMechanism(event, {
        handled: true,
        type: 'generic',
      });
    }

    client.captureEvent(event, hint);

    if (__DEV__) {
      // If in dev, we call the default handler anyway and hope the error will be sent
      // Just for a better dev experience
      defaultHandler(error, isFatal);
      return;
    }

    void client.flush(client.getOptions().shutdownTimeout || 2000).then(
      () => {
        defaultHandler(error, isFatal);
      },
      (reason: unknown) => {
        logger.error('[ReactNativeErrorHandlers] Error while flushing the event cache after uncaught error.', reason);
      },
    );
  });
}
