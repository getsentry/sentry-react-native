import { IdleTransaction, SpanStatus } from "@sentry/tracing";

/**
 * Converts from seconds to milliseconds
 * @param time time in seconds
 */
function secToMs(time: number): number {
  return time * 1000;
}

/**
 *
 */
export function adjustTransactionDuration(
  maxDuration: number, // in seconds
  transaction: IdleTransaction,
  endTimestamp: number
): void {
  const diff = endTimestamp - transaction.startTimestamp;
  const isOutdatedTransaction =
    endTimestamp && (diff > secToMs(maxDuration) || diff < 0);
  if (isOutdatedTransaction) {
    transaction.setStatus(SpanStatus.DeadlineExceeded);
    transaction.setTag("maxTransactionDurationExceeded", "true");
  }
}
