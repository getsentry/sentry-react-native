import type { Event, Integration, SpanJSON } from '@sentry/core';
import { logger } from '@sentry/core';

import { NATIVE } from '../../wrapper';
import { UI_LOAD_FULL_DISPLAY, UI_LOAD_INITIAL_DISPLAY } from '../ops';
import { SPAN_ORIGIN_AUTO_UI_TIME_TO_DISPLAY, SPAN_ORIGIN_MANUAL_UI_TIME_TO_DISPLAY } from '../origin';
import { getReactNavigationIntegration } from '../reactnavigation';
import { SEMANTIC_ATTRIBUTE_ROUTE_HAS_BEEN_SEEN } from '../semanticAttributes';
import { SPAN_THREAD_NAME, SPAN_THREAD_NAME_JAVASCRIPT } from '../span';
import { getTimeToInitialDisplayFallback } from '../timeToDisplayFallback';
import { createSpanJSON } from '../utils';

export const INTEGRATION_NAME = 'TimeToDisplay';

const TIME_TO_DISPLAY_TIMEOUT_MS = 30_000;
const isDeadlineExceeded = (durationMs: number): boolean => durationMs > TIME_TO_DISPLAY_TIMEOUT_MS;

export const timeToDisplayIntegration = (): Integration => {
  let enableTimeToInitialDisplayForPreloadedRoutes = false;

  return {
    name: INTEGRATION_NAME,
    afterAllSetup(client) {
      enableTimeToInitialDisplayForPreloadedRoutes =
        getReactNavigationIntegration(client)?.options.enableTimeToInitialDisplayForPreloadedRoutes ?? false;
    },
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
      event.measurements = event.measurements || {};

      const ttidSpan = await addTimeToInitialDisplay({
        event,
        rootSpanId,
        transactionStartTimestampSeconds,
        enableTimeToInitialDisplayForPreloadedRoutes,
      });
      const ttfdSpan = await addTimeToFullDisplay({ event, rootSpanId, transactionStartTimestampSeconds, ttidSpan });

      if (ttidSpan && ttidSpan.start_timestamp && ttidSpan.timestamp) {
        event.measurements['time_to_initial_display'] = {
          value: (ttidSpan.timestamp - ttidSpan.start_timestamp) * 1000,
          unit: 'millisecond',
        };
      }

      if (ttfdSpan && ttfdSpan.start_timestamp && ttfdSpan.timestamp) {
        const durationMs = (ttfdSpan.timestamp - ttfdSpan.start_timestamp) * 1000;
        if (isDeadlineExceeded(durationMs)) {
          event.measurements['time_to_full_display'] = event.measurements['time_to_initial_display'];
        } else {
          event.measurements['time_to_full_display'] = {
            value: durationMs,
            unit: 'millisecond',
          };
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

async function addTimeToInitialDisplay({
  event,
  rootSpanId,
  transactionStartTimestampSeconds,
  enableTimeToInitialDisplayForPreloadedRoutes,
}: {
  event: Event;
  rootSpanId: string;
  transactionStartTimestampSeconds: number;
  enableTimeToInitialDisplayForPreloadedRoutes: boolean;
}): Promise<SpanJSON | undefined> {
  const ttidEndTimestampSeconds = await NATIVE.popTimeToDisplayFor(`ttid-${rootSpanId}`);

  let ttidSpan: SpanJSON | undefined = event.spans?.find(span => span.op === UI_LOAD_INITIAL_DISPLAY);

  if (ttidSpan && (ttidSpan.status === undefined || ttidSpan.status === 'ok') && !ttidEndTimestampSeconds) {
    logger.debug(`[${INTEGRATION_NAME}] Ttid span already exists and is ok.`, ttidSpan);
    return ttidSpan;
  }

  if (!ttidEndTimestampSeconds) {
    logger.debug(`[${INTEGRATION_NAME}] No manual ttid end timestamp found for span ${rootSpanId}.`);
    return addAutomaticTimeToInitialDisplay({
      event,
      rootSpanId,
      transactionStartTimestampSeconds,
      enableTimeToInitialDisplayForPreloadedRoutes,
    });
  }

  if (ttidSpan && ttidSpan.status && ttidSpan.status !== 'ok') {
    ttidSpan.status = 'ok';
    ttidSpan.timestamp = ttidEndTimestampSeconds;
    logger.debug(`[${INTEGRATION_NAME}] Updated existing ttid span.`, ttidSpan);
    return ttidSpan;
  }

  ttidSpan = createSpanJSON({
    op: UI_LOAD_INITIAL_DISPLAY,
    description: 'Time To Initial Display',
    start_timestamp: transactionStartTimestampSeconds,
    timestamp: ttidEndTimestampSeconds,
    origin: SPAN_ORIGIN_MANUAL_UI_TIME_TO_DISPLAY,
    parent_span_id: rootSpanId,
    data: {
      [SPAN_THREAD_NAME]: SPAN_THREAD_NAME_JAVASCRIPT,
    },
  });
  logger.debug(`[${INTEGRATION_NAME}] Added ttid span to transaction.`, ttidSpan);
  event.spans.push(ttidSpan);
  return ttidSpan;
}

async function addAutomaticTimeToInitialDisplay({
  event,
  rootSpanId,
  transactionStartTimestampSeconds,
  enableTimeToInitialDisplayForPreloadedRoutes,
}: {
  event: Event;
  rootSpanId: string;
  transactionStartTimestampSeconds: number;
  enableTimeToInitialDisplayForPreloadedRoutes: boolean;
}): Promise<SpanJSON | undefined> {
  const ttidNativeTimestampSeconds = await NATIVE.popTimeToDisplayFor(`ttid-navigation-${rootSpanId}`);
  const ttidFallbackTimestampSeconds = await getTimeToInitialDisplayFallback(rootSpanId);

  const hasBeenSeen = event.contexts?.trace?.data?.[SEMANTIC_ATTRIBUTE_ROUTE_HAS_BEEN_SEEN];
  if (hasBeenSeen && !enableTimeToInitialDisplayForPreloadedRoutes) {
    logger.debug(
      `[${INTEGRATION_NAME}] Route has been seen and time to initial display is disabled for preloaded routes.`,
    );
    return undefined;
  }

  const ttidTimestampSeconds = ttidNativeTimestampSeconds ?? ttidFallbackTimestampSeconds;
  if (!ttidTimestampSeconds) {
    logger.debug(`[${INTEGRATION_NAME}] No automatic ttid end timestamp found for span ${rootSpanId}.`);
    return undefined;
  }

  const viewNames = event.contexts?.app?.view_names;
  const screenName = Array.isArray(viewNames) ? viewNames[0] : viewNames;

  const ttidSpan = createSpanJSON({
    op: UI_LOAD_INITIAL_DISPLAY,
    description: screenName ? `${screenName} initial display` : 'Time To Initial Display',
    start_timestamp: transactionStartTimestampSeconds,
    timestamp: ttidTimestampSeconds,
    origin: SPAN_ORIGIN_AUTO_UI_TIME_TO_DISPLAY,
    parent_span_id: rootSpanId,
    data: {
      [SPAN_THREAD_NAME]: SPAN_THREAD_NAME_JAVASCRIPT,
    },
  });
  event.spans = event.spans ?? [];
  event.spans.push(ttidSpan);
  return ttidSpan;
}

async function addTimeToFullDisplay({
  event,
  rootSpanId,
  transactionStartTimestampSeconds,
  ttidSpan,
}: {
  event: Event;
  rootSpanId: string;
  transactionStartTimestampSeconds: number;
  ttidSpan: SpanJSON | undefined;
}): Promise<SpanJSON | undefined> {
  const ttfdEndTimestampSeconds = await NATIVE.popTimeToDisplayFor(`ttfd-${rootSpanId}`);

  if (!ttidSpan || !ttfdEndTimestampSeconds) {
    return undefined;
  }

  let ttfdSpan = event.spans?.find(span => span.op === UI_LOAD_FULL_DISPLAY);

  let ttfdAdjustedEndTimestampSeconds = ttfdEndTimestampSeconds;
  const ttfdIsBeforeTtid = ttidSpan?.timestamp && ttfdEndTimestampSeconds < ttidSpan.timestamp;
  if (ttfdIsBeforeTtid) {
    ttfdAdjustedEndTimestampSeconds = ttidSpan.timestamp;
  }

  const durationMs = (ttfdAdjustedEndTimestampSeconds - transactionStartTimestampSeconds) * 1000;

  if (ttfdSpan && ttfdSpan.status && ttfdSpan.status !== 'ok') {
    ttfdSpan.status = 'ok';
    ttfdSpan.timestamp = ttfdAdjustedEndTimestampSeconds;
    logger.debug(`[${INTEGRATION_NAME}] Updated existing ttfd span.`, ttfdSpan);
    return ttfdSpan;
  }

  ttfdSpan = createSpanJSON({
    status: isDeadlineExceeded(durationMs) ? 'deadline_exceeded' : 'ok',
    op: UI_LOAD_FULL_DISPLAY,
    description: 'Time To Full Display',
    start_timestamp: transactionStartTimestampSeconds,
    timestamp: ttfdAdjustedEndTimestampSeconds,
    origin: SPAN_ORIGIN_MANUAL_UI_TIME_TO_DISPLAY,
    parent_span_id: rootSpanId,
    data: {
      [SPAN_THREAD_NAME]: SPAN_THREAD_NAME_JAVASCRIPT,
    },
  });
  logger.debug(`[${INTEGRATION_NAME}] Added ttfd span to transaction.`, ttfdSpan);
  event.spans.push(ttfdSpan);
  return ttfdSpan;
}
