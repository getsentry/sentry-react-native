import { logger } from '@sentry/utils';

import { ReactNativeLibraries } from '../utils/rnlibraries';
import { RN_GLOBAL_OBJ } from '../utils/worldwide';

/**
 * Polyfill the global promise instance with one we can be sure that we can attach the tracking to.
 *
 * In newer RN versions >=0.63, the global promise is not the same reference as the one imported from the promise library.
 * This is due to a version mismatch between promise versions.
 * Originally we tried a solution where we would have you put a package resolution to ensure the promise instances match. However,
 * - Using a package resolution requires the you to manually troubleshoot.
 * - The package resolution fix no longer works with 0.67 on iOS Hermes.
 */
export function polyfillPromise(): void {
  if (!ReactNativeLibraries.Utilities) {
    logger.warn('Could not polyfill Promise. React Native Libraries Utilities not found.');
    return;
  }

  const Promise = getPromisePolyfill();

  // As of RN 0.67 only done and finally are used
  // eslint-disable-next-line import/no-extraneous-dependencies
  require('promise/setimmediate/done');
  // eslint-disable-next-line import/no-extraneous-dependencies
  require('promise/setimmediate/finally');

  ReactNativeLibraries.Utilities.polyfillGlobal('Promise', () => Promise);
}

/**
 * Single source of truth for the Promise implementation we want to use.
 * This is important for verifying that the rejected promise tracing will work as expected.
 */
export function getPromisePolyfill(): unknown {
  /* eslint-disable import/no-extraneous-dependencies,@typescript-eslint/no-var-requires */
  // Below, we follow the exact way React Native initializes its promise library, and we globally replace it.
  return require('promise/setimmediate/es6-extensions');
}

/**
 * Lazy require the rejection tracking module
 */
export function requireRejectionTracking(): {
  disable: () => void;
  enable: (arg: unknown) => void;
} {
  // eslint-disable-next-line @typescript-eslint/no-var-requires,import/no-extraneous-dependencies
  return require('promise/setimmediate/rejection-tracking');
}

/**
 * Checks if the promise is the same one or not, if not it will warn the user
 */
export function checkPromiseAndWarn(): void {
  try {
    // `promise` package is a dependency of react-native, therefore it is always available.
    // but it is possible that the user has installed a different version of promise
    // or dependency that uses a different version.
    // We have to check if the React Native Promise and the `promise` package Promise are using the same reference.
    // If they are not, likely there are multiple versions of the `promise` package installed.
    const ReactNativePromise = ReactNativeLibraries.Promise;
    // eslint-disable-next-line @typescript-eslint/no-var-requires,import/no-extraneous-dependencies
    const PromisePackagePromise = require('promise/setimmediate/es6-extensions');
    const UsedPromisePolyfill = getPromisePolyfill();

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
