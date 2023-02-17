import type { BeforeFinishCallback, IdleTransaction } from '@sentry/tracing/types/idletransaction';
import { logger } from '@sentry/utils';

/**
 * TODO:
 */
export const onlySampleIfChildSpans: BeforeFinishCallback = (
  transaction: IdleTransaction,
): void => {
  const spansCount = transaction.spanRecorder && transaction.spanRecorder.spans.filter(
    (span) => span.spanId !== transaction.spanId
  ).length;

  if (!spansCount || spansCount <= 0) {
    logger.log(`Not sampling as ${transaction.op} transaction has no child spans.`);
    transaction.sampled = false;
  }
}
