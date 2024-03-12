import { getActiveSpan, setMeasurement, Span as SpanClass, spanToJSON, startInactiveSpan } from '@sentry/core';
import type { Span,StartSpanOptions  } from '@sentry/types';
import { fill, logger } from '@sentry/utils';
import React from 'react';

import { getRNSentryOnDrawReporter, nativeComponentExists } from './timetodisplaynative';
import type {RNSentryOnDrawNextFrameEvent } from './timetodisplaynative.types';

let nativeComponentMissingLogged = false;

/**
 * Flags of active spans with manual initial display.
 */
const manualInitialDisplaySpans = new WeakMap<Span, true>();

export type TimeToDisplayProps = {
  children?: React.ReactNode;
  name?: string;
  initialDisplay?: boolean;
  fullDisplay?: boolean;
};

/**
 * Wrapper for manual TTID and TTFD tracing.
 *
 * The component native implementation waits for the next frame after draw to mark the TTID/TTFD.
 */
export function TimeToDisplay(props: TimeToDisplayProps): React.ReactElement {
  const activeSpan = getActiveSpan();
  if (activeSpan && props.initialDisplay) {
    manualInitialDisplaySpans.set(activeSpan, true);
  }

  const RNSentryOnDrawReporter = getRNSentryOnDrawReporter();

  if (__DEV__ && !nativeComponentMissingLogged && !nativeComponentExists) {
    nativeComponentMissingLogged = true;
    logger.error('RNSentryOnDrawReporter is not available on the web and Expo Go. Run native build or report an issue at https://github.com/getsentry/sentry-react-native');
  }

  const onDraw = (event: { nativeEvent: RNSentryOnDrawNextFrameEvent }): void => onDrawNextFrame(props.name, event);

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
  options?: Exclude<StartSpanOptions, 'op' | 'name'> & { name?: string },
): Span | undefined {
  const activeSpan = getActiveSpan();
  if (!activeSpan) {
    logger.warn(`[TimeToDisplay] No active span found to attach ui.load.initial_display to.`);
    return;
  }

  if (!(activeSpan instanceof SpanClass)) {
    logger.warn(`[TimeToDisplay] Active span is not instance of Span class.`);
    return;
  }

  const existingSpan = activeSpan.spanRecorder?.spans.find((span) => spanToJSON(span).op === 'ui.load.initial_display');
  if (existingSpan) {
    logger.debug(`[TimeToDisplay] Found existing ui.load.initial_display span.`);
    return existingSpan
  }

  const initialDisplaySpan = startInactiveSpan({
    op: 'ui.load.initial_display',
    name: 'Time To Initial Display',
    startTimestamp: spanToJSON(activeSpan).start_timestamp,
    ...options,
  });

  if (!initialDisplaySpan) {
    return;
  }

  manualInitialDisplaySpans.set(activeSpan, true);
  return initialDisplaySpan;
}

/**
 * Starts a new span for the full display.
 *
 * Returns current span if already exists in the currently active span.
 */
export function startTimeToFullDisplaySpan(
  options: Omit<StartSpanOptions, 'op' | 'name'> & { name?: string, timeoutMs?: number } = {
    timeoutMs: 30_000,
  },
): Span | undefined {
  const activeSpan = getActiveSpan();
  if (!activeSpan) {
    logger.warn(`[TimeToDisplay] No active span found to attach ui.load.full_display to.`);
    return;
  }

  if (!(activeSpan instanceof SpanClass)) {
    logger.warn(`[TimeToDisplay] Active span is not instance of Span class.`);
    return;
  }

  const descendantSpans = activeSpan.spanRecorder?.spans || [];

  const initialDisplaySpan = descendantSpans.find((span) => spanToJSON(span).op === 'ui.load.initial_display');
  if (!initialDisplaySpan) {
    logger.warn(`[TimeToDisplay] No initial display span found to attach ui.load.full_display to.`);
    return;
  }

  const existingSpan = descendantSpans.find((span) => spanToJSON(span).op === 'ui.load.full_display');
  if (existingSpan) {
    logger.debug(`[TimeToDisplay] Found existing ui.load.full_display span.`);
    return existingSpan;
  }

  const fullDisplaySpan = startInactiveSpan({
    op: 'ui.load.full_display',
    name: 'Time To Full Display',
    startTimestamp: spanToJSON(initialDisplaySpan).start_timestamp,
    ...options,
  });
  if (!fullDisplaySpan) {
    return;
  }

  const timeout = setTimeout(() => {
    if (spanToJSON(fullDisplaySpan).timestamp) {
      return;
    }
    fullDisplaySpan.setStatus('deadline_exceeded');
    fullDisplaySpan.end(spanToJSON(initialDisplaySpan).timestamp);
    setSpanDurationAsMeasurement('time_to_full_display', fullDisplaySpan);
    logger.warn(`[TimeToDisplay] Full display span deadline_exceeded.`);
  }, options.timeoutMs);

  fill(fullDisplaySpan, 'end', (originalEnd: SpanClass['end']) => (endTimestamp?: Parameters<SpanClass['end']>[0]) => {
    clearTimeout(timeout);
    originalEnd.call(fullDisplaySpan, endTimestamp);
  });

  return fullDisplaySpan;
}

function onDrawNextFrame(name: string | undefined, event: { nativeEvent: RNSentryOnDrawNextFrameEvent }): void {
  logger.debug(`[TimeToDisplay] onDrawNextFrame: ${JSON.stringify(event.nativeEvent)}`);
  if (event.nativeEvent.type === 'fullDisplay') {
    return updateFullDisplaySpan('ui.load.full_display', name, event.nativeEvent);
  }
  if (event.nativeEvent.type === 'initialDisplay') {
    return updateInitialDisplaySpan('ui.load.initial_display', name, event.nativeEvent);
  }
}

function updateInitialDisplaySpan(op: string, name: string | undefined, event: RNSentryOnDrawNextFrameEvent): void {
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

  span.end(event.newFrameTimestampInSeconds);
  span.setStatus('ok');
  logger.debug(`[TimeToDisplay] ${spanToJSON(span).description} span updated with end timestamp.`);

  setSpanDurationAsMeasurement('time_to_initial_display', span);
}

function updateFullDisplaySpan(op: string, name: string | undefined, event: RNSentryOnDrawNextFrameEvent): void {
  const span = startTimeToFullDisplaySpan();
  if (!span) {
    logger.warn(`[TimeToDisplay] No span found or created, possibly performance is disabled.`);
    return;
  }

  if (spanToJSON(span).timestamp) {
    logger.warn(`[TimeToDisplay] ${spanToJSON(span).description} span already ended.`);
    return;
  }

  span.end(event.newFrameTimestampInSeconds);

  span.setStatus('ok');
  logger.debug(`[TimeToDisplay] ${spanToJSON(span).description} span updated with end timestamp.`);

  setSpanDurationAsMeasurement('time_to_full_display', span);
}

function setSpanDurationAsMeasurement(name: string, span: Span): void {
  const spanEnd = spanToJSON(span).timestamp;
  const spanStart = spanToJSON(span).start_timestamp;
  if (!spanEnd || !spanStart) {
    return;
  }

  setMeasurement(name, (spanEnd - spanStart) * 1000, 'millisecond');
}
