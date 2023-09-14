import type { BeforeFinishCallback, IdleTransaction } from '@sentry/core';
import { logger } from '@sentry/utils';

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
