import { type BeforeFinishCallback, type IdleTransaction } from '@sentry/core';
import { logger } from '@sentry/utils';
import type { AppStateStatus, NativeEventSubscription } from 'react-native';
import { AppState } from 'react-native';

/**
 * Idle Transaction callback to only sample transactions with child spans.
 * To avoid side effects of other callbacks this should be hooked as the last callback.
 */
export const onlySampleIfChildSpans: BeforeFinishCallback = (transaction: IdleTransaction): void => {
  const spansCount =
    transaction.spanRecorder &&
    transaction.spanRecorder.spans.filter(span => span.spanId !== transaction.spanId).length;

  if (!spansCount || spansCount <= 0) {
    logger.log(`Not sampling as ${transaction.op} transaction has no child spans.`);
    transaction.sampled = false;
  }
};

/**
 * Hooks on AppState change to cancel the transaction if the app goes background.
 */
export const cancelInBackground = (transaction: IdleTransaction): void => {
  if (!AppState || !AppState.isAvailable) {
    logger.warn('AppState is not available, spans will not be canceled in background.');
    return;
  }

  // RN Web can return undefined, https://github.com/necolas/react-native-web/blob/8cf720f0e57c74a254bfa7bed0313e33a4b29c11/packages/react-native-web/src/exports/AppState/index.js#L55
  const subscription: NativeEventSubscription | undefined = AppState.addEventListener(
    'change',
    (newState: AppStateStatus) => {
      if (newState === 'background') {
        logger.debug(`Setting ${transaction.op} transaction to cancelled because the app is in the background.`);
        transaction.setStatus('cancelled');
        transaction.finish();
      }
    },
  );
  subscription &&
    transaction.registerBeforeFinishCallback(() => {
      logger.debug(`Removing AppState listener for ${transaction.op} transaction.`);
      subscription && subscription.remove && subscription.remove();
    });
};
