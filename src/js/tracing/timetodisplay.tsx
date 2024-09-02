import { getActiveSpan, getSpanDescendants, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SPAN_STATUS_ERROR, SPAN_STATUS_OK, spanToJSON, startInactiveSpan } from '@sentry/core';
import type { Span,StartSpanOptions  } from '@sentry/types';
import { fill, logger } from '@sentry/utils';
import * as React from 'react';

import { getRNSentryOnDrawReporter, nativeComponentExists } from './timetodisplaynative';
import type {RNSentryOnDrawNextFrameEvent } from './timetodisplaynative.types';
import { setSpanDurationAsMeasurement } from './utils';

let nativeComponentMissingLogged = false;

/**
 * Flags of active spans with manual initial display.
 */
export const manualInitialDisplaySpans = new WeakMap<Span, true>();

/**
 * Flag full display called before initial display for an active span.
 */
const fullDisplayBeforeInitialDisplay = new WeakMap<Span, true>();

export type TimeToDisplayProps = {
  children?: React.ReactNode;
  spanName?: string;
  record?: boolean;
};

/**
 * Component to measure time to initial display.
 *
 * The initial display is recorded when the component prop `record` is true.
 *
 * <TimeToInitialDisplay record />
 */
export function TimeToInitialDisplay(props: TimeToDisplayProps): React.ReactElement {
  const activeSpan = getActiveSpan();
  if (activeSpan) {
    manualInitialDisplaySpans.set(activeSpan, true);
    startTimeToInitialDisplaySpan();
  }

  return <TimeToDisplay initialDisplay={props.record}>{props.children}</TimeToDisplay>;
}

/**
 * Component to measure time to full display.
 *
 * The initial display is recorded when the component prop `record` is true.
 *
 * <TimeToInitialDisplay record />
 */
export function TimeToFullDisplay(props: TimeToDisplayProps): React.ReactElement {
  startTimeToFullDisplaySpan();
  return <TimeToDisplay fullDisplay={props.record}>{props.children}</TimeToDisplay>;
}

function TimeToDisplay(props: {
  children?: React.ReactNode;
  initialDisplay?: boolean;
  fullDisplay?: boolean;
}): React.ReactElement {
  const RNSentryOnDrawReporter = getRNSentryOnDrawReporter();

  if (__DEV__ && !nativeComponentMissingLogged && !nativeComponentExists) {
    nativeComponentMissingLogged = true;
    // Using setTimeout with a delay of 0 milliseconds to defer execution and avoid printing the React stack trace.
    setTimeout(() => {
      logger.warn('TimeToInitialDisplay and TimeToFullDisplay are not supported on the web, Expo Go and New Architecture. Run native build or report an issue at https://github.com/getsentry/sentry-react-native');
    }, 0);
  }

  const onDraw = (event: { nativeEvent: RNSentryOnDrawNextFrameEvent }): void => onDrawNextFrame(event);

  return (
    <>
      <RNSentryOnDrawReporter
        onDrawNextFrame={onDraw}
        initialDisplay={props.initialDisplay}
        fullDisplay={props.fullDisplay} />
      {props.children}
    </>
  );
}

/**
 * Starts a new span for the initial display.
 *
 * Returns current span if already exists in the currently active span.
 */
export function startTimeToInitialDisplaySpan(
  options?: Omit<StartSpanOptions, 'op' | 'name'> & {
    name?: string;
    isAutoInstrumented?: boolean
  },
): Span | undefined {
  const activeSpan = getActiveSpan();
  if (!activeSpan) {
    logger.warn(`[TimeToDisplay] No active span found to attach ui.load.initial_display to.`);
    return undefined;
  }

  const existingSpan = getSpanDescendants(activeSpan).find((span) => spanToJSON(span).op === 'ui.load.initial_display');
  if (existingSpan) {
    logger.debug(`[TimeToDisplay] Found existing ui.load.initial_display span.`);
    return existingSpan
  }

  const initialDisplaySpan = startInactiveSpan({
    op: 'ui.load.initial_display',
    name: 'Time To Initial Display',
    startTime: spanToJSON(activeSpan).start_timestamp,
    ...options,
  });

  if (!initialDisplaySpan) {
    return undefined;
  }

  if (options?.isAutoInstrumented) {
    initialDisplaySpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, 'auto.ui.time_to_display');
  } else {
    manualInitialDisplaySpans.set(activeSpan, true);
    initialDisplaySpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, 'manual.ui.time_to_display');
  }

  return initialDisplaySpan;
}

/**
 * Starts a new span for the full display.
 *
 * Returns current span if already exists in the currently active span.
 */
export function startTimeToFullDisplaySpan(
  options: Omit<StartSpanOptions, 'op' | 'name'> & {
    name?: string,
    timeoutMs?: number,
    isAutoInstrumented?: boolean
  } = {
    timeoutMs: 30_000,
  },
): Span | undefined {
  const activeSpan = getActiveSpan();
  if (!activeSpan) {
    logger.warn(`[TimeToDisplay] No active span found to attach ui.load.full_display to.`);
    return undefined;
  }

  const descendantSpans = getSpanDescendants(activeSpan);

  const initialDisplaySpan = descendantSpans.find((span) => spanToJSON(span).op === 'ui.load.initial_display');
  if (!initialDisplaySpan) {
    logger.warn(`[TimeToDisplay] No initial display span found to attach ui.load.full_display to.`);
    return undefined;
  }

  const existingSpan = descendantSpans.find((span) => spanToJSON(span).op === 'ui.load.full_display');
  if (existingSpan) {
    logger.debug(`[TimeToDisplay] Found existing ui.load.full_display span.`);
    return existingSpan;
  }

  const fullDisplaySpan = startInactiveSpan({
    op: 'ui.load.full_display',
    name: 'Time To Full Display',
    startTime: spanToJSON(initialDisplaySpan).start_timestamp,
    ...options,
  });
  if (!fullDisplaySpan) {
    return undefined;
  }

  const timeout = setTimeout(() => {
    if (spanToJSON(fullDisplaySpan).timestamp) {
      return;
    }
    fullDisplaySpan.setStatus({ code: SPAN_STATUS_ERROR, message: 'deadline_exceeded' });
    fullDisplaySpan.end(spanToJSON(initialDisplaySpan).timestamp);
    setSpanDurationAsMeasurement('time_to_full_display', fullDisplaySpan);
    logger.warn(`[TimeToDisplay] Full display span deadline_exceeded.`);
  }, options.timeoutMs);

  fill(fullDisplaySpan, 'end', (originalEnd: Span['end']) => (endTimestamp?: Parameters<Span['end']>[0]) => {
    clearTimeout(timeout);
    originalEnd.call(fullDisplaySpan, endTimestamp);
  });

  if (options?.isAutoInstrumented) {
    fullDisplaySpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, 'auto.ui.time_to_display');
  } else {
    fullDisplaySpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, 'manual.ui.time_to_display');
  }

  return fullDisplaySpan;
}

function onDrawNextFrame(event: { nativeEvent: RNSentryOnDrawNextFrameEvent }): void {
  logger.debug(`[TimeToDisplay] onDrawNextFrame: ${JSON.stringify(event.nativeEvent)}`);
  if (event.nativeEvent.type === 'fullDisplay') {
    return updateFullDisplaySpan(event.nativeEvent.newFrameTimestampInSeconds);
  }
  if (event.nativeEvent.type === 'initialDisplay') {
    return updateInitialDisplaySpan(event.nativeEvent.newFrameTimestampInSeconds);
  }
}

function updateInitialDisplaySpan(frameTimestampSeconds: number): void {
  const span = startTimeToInitialDisplaySpan();
  if (!span) {
    logger.warn(`[TimeToDisplay] No span found or created, possibly performance is disabled.`);
    return;
  }

  const activeSpan = getActiveSpan();
  if (!activeSpan) {
    logger.warn(`[TimeToDisplay] No active span found to attach ui.load.initial_display to.`);
    return;
  }

  if (spanToJSON(span).parent_span_id !== spanToJSON(activeSpan).span_id) {
    logger.warn(`[TimeToDisplay] Initial display span is not a child of current active span.`);
    return;
  }

  if (spanToJSON(span).timestamp) {
    logger.warn(`[TimeToDisplay] ${spanToJSON(span).description} span already ended.`);
    return;
  }

  span.end(frameTimestampSeconds);
  span.setStatus({ code: SPAN_STATUS_OK });
  logger.debug(`[TimeToDisplay] ${spanToJSON(span).description} span updated with end timestamp.`);

  if (fullDisplayBeforeInitialDisplay.has(activeSpan)) {
    fullDisplayBeforeInitialDisplay.delete(activeSpan);
    logger.debug(`[TimeToDisplay] Updating full display with initial display (${span.spanContext().spanId}) end.`);
    updateFullDisplaySpan(frameTimestampSeconds, span);
  }

  setSpanDurationAsMeasurement('time_to_initial_display', span);
}

function updateFullDisplaySpan(frameTimestampSeconds: number, passedInitialDisplaySpan?: Span): void {
  const activeSpan = getActiveSpan();
  if (!activeSpan) {
    logger.warn(`[TimeToDisplay] No active span found to update ui.load.full_display in.`);
    return;
  }

  const existingInitialDisplaySpan = passedInitialDisplaySpan
    || getSpanDescendants(activeSpan).find((span) => spanToJSON(span).op === 'ui.load.initial_display');
  const initialDisplayEndTimestamp = existingInitialDisplaySpan && spanToJSON(existingInitialDisplaySpan).timestamp;
  if (!initialDisplayEndTimestamp) {
    fullDisplayBeforeInitialDisplay.set(activeSpan, true);
    logger.warn(`[TimeToDisplay] Full display called before initial display for active span (${activeSpan.spanContext().spanId}).`);
    return;
  }

  const span = startTimeToFullDisplaySpan({
    isAutoInstrumented: true,
  });
  if (!span) {
    logger.warn(`[TimeToDisplay] No TimeToFullDisplay span found or created, possibly performance is disabled.`);
    return;
  }

  const spanJSON = spanToJSON(span);
  if (spanJSON.timestamp) {
    logger.warn(`[TimeToDisplay] ${spanJSON.description} (${spanJSON.span_id}) span already ended.`);
    return;
  }

  if (initialDisplayEndTimestamp > frameTimestampSeconds) {
    logger.warn(`[TimeToDisplay] Using initial display end. Full display end frame timestamp is before initial display end.`);
    span.end(initialDisplayEndTimestamp);
  } else {
    span.end(frameTimestampSeconds);
  }

  span.setStatus({ code: SPAN_STATUS_OK });
  logger.debug(`[TimeToDisplay] ${spanJSON.description} (${spanJSON.span_id}) span updated with end timestamp.`);

  setSpanDurationAsMeasurement('time_to_full_display', span);
}
