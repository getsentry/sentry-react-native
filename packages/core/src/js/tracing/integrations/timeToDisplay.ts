import type { Integration, SpanJSON } from '@sentry/core';
import { logger } from '@sentry/core';
import { NATIVE } from '../../wrapper';
import { createSpanJSON } from '../utils';
import { SPAN_ORIGIN_MANUAL_UI_TIME_TO_DISPLAY } from '../origin';
import { UI_LOAD_INITIAL_DISPLAY, UI_LOAD_FULL_DISPLAY } from '../ops';
export const INTEGRATION_NAME = 'TimeToDisplay';

export const timeToDisplayIntegration = (): Integration => {
  return {
    name: INTEGRATION_NAME,
    processEvent: async event => {
      if (event.type !== 'transaction') {
        // TimeToDisplay data is only relevant for transactions
        return event;
      }

      const rootSpanId = event.contexts.trace.span_id;
      if (!rootSpanId) {
        logger.warn(`[${INTEGRATION_NAME}] No root span id found in transaction.`);
        return event;
      }

      const transactionStartTimestampSeconds = event.start_timestamp;
      if (!transactionStartTimestampSeconds) {
        // This should never happen
        logger.warn(`[${INTEGRATION_NAME}] No transaction start timestamp found in transaction.`);
        return event;
      }

      event.spans = event.spans || [];

      const ttidEndTimestampSeconds = await NATIVE.popTimeToDisplayFor(`ttid-${rootSpanId}`);
      let ttidSpan: SpanJSON | undefined = event.spans?.find(span => span.op === UI_LOAD_INITIAL_DISPLAY);
      if (ttidEndTimestampSeconds) {
        if (ttidSpan && ttidSpan.status && ttidSpan.status !== 'ok') {
          ttidSpan.status = 'ok';
          ttidSpan.timestamp = ttidEndTimestampSeconds;
          logger.debug(`[${INTEGRATION_NAME}] Updated existing ttid span.`, ttidSpan);
        } else {
          ttidSpan = createSpanJSON({
            op: UI_LOAD_INITIAL_DISPLAY,
            description: 'NEW Time To Initial Display',
            start_timestamp: transactionStartTimestampSeconds,
            timestamp: ttidEndTimestampSeconds,
            origin: SPAN_ORIGIN_MANUAL_UI_TIME_TO_DISPLAY,
            parent_span_id: rootSpanId,
            // TODO: Add data
          });
          logger.debug(`[${INTEGRATION_NAME}] Added ttid span to transaction.`, ttidSpan);
          event.spans?.push(ttidSpan);
        }
      }

      // TODO: Should we trim it to 30s a.k.a max timeout?
      const ttfdEndTimestampSeconds = await NATIVE.popTimeToDisplayFor(`ttfd-${rootSpanId}`);
      let ttfdSpan: SpanJSON | undefined;
      if (ttfdEndTimestampSeconds && ttidSpan) {
        ttfdSpan = event.spans?.find(span => span.op === UI_LOAD_FULL_DISPLAY);
        const ttfdAdjustedEndTimestampSeconds =
          ttidSpan?.timestamp && ttfdEndTimestampSeconds < ttidSpan.timestamp
            ? ttidSpan.timestamp
            : ttfdEndTimestampSeconds;
        if (ttfdSpan && ttfdSpan.status && ttfdSpan.status !== 'ok') {
          ttfdSpan.status = 'ok';
          ttfdSpan.timestamp = ttfdAdjustedEndTimestampSeconds;
          logger.debug(`[${INTEGRATION_NAME}] Updated existing ttfd span.`, ttfdSpan);
        } else {
          ttfdSpan = createSpanJSON({
            op: UI_LOAD_FULL_DISPLAY,
            description: 'Time To Full Display',
            start_timestamp: transactionStartTimestampSeconds,
            timestamp: ttfdAdjustedEndTimestampSeconds,
            origin: SPAN_ORIGIN_MANUAL_UI_TIME_TO_DISPLAY,
            parent_span_id: rootSpanId,
            // TODO: Add data
          });
          logger.debug(`[${INTEGRATION_NAME}] Added ttfd span to transaction.`, ttfdSpan);
          event.spans?.push(ttfdSpan);
        }
      }

      const newTransactionEndTimestampSeconds = Math.max(
        ttidSpan?.timestamp ?? -1,
        ttfdSpan?.timestamp ?? -1,
        event.timestamp ?? -1,
      );
      if (newTransactionEndTimestampSeconds !== -1) {
        event.timestamp = newTransactionEndTimestampSeconds;
      }

      return event;
    },
  };
};
