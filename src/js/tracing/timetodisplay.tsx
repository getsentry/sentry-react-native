import { getActiveSpan, setMeasurement, Span as SpanClass, spanToJSON, startInactiveSpan } from '@sentry/core';
import type { Span,StartSpanOptions  } from '@sentry/types';
import { logger } from '@sentry/utils';
import React from 'react';

import { notWeb } from '../utils/environment';
import { getRNSentryOnDrawReporter, nativeComponentExists } from './timetodisplaynative';
import type {RNSentryOnDrawNextFrameEvent } from './timetodisplaynative.types';

let nativeComponentMissingLogged = false;

export type TimeToDisplayProps = {
  children?: React.ReactNode;
  name?: string;
  initialDisplay?: boolean;
  fullDisplay?: boolean;
};

/**
 * Wrapper for manual TTID and TTFD tracing.
 *
 * The component native implementation wait for the next frame after draw to mark the TTID/TTFD.
 */
export function TimeToDisplay(props: TimeToDisplayProps): React.ReactElement {
  const RNSentryOnDrawReporter = getRNSentryOnDrawReporter();

  if (__DEV__ && !nativeComponentMissingLogged && !nativeComponentExists && !notWeb()) {
    nativeComponentMissingLogged = true;
    logger.error('RNSentryOnDrawReporter is not available. Native Sentry modules is not loaded. Update your native build or report an issue at https://github.com/getsentry/sentry-react-native');
  }

  const onDraw = (event: { nativeEvent: RNSentryOnDrawNextFrameEvent }): void => onDrawNextFrame(props.name || 'Unknown', event);

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

function onDrawNextFrame(name: string, event: { nativeEvent: RNSentryOnDrawNextFrameEvent }): void {
  logger.debug(`[TimeToDisplay] onDrawNextFrame: ${JSON.stringify(event.nativeEvent)}`);
  if (event.nativeEvent.type === 'fullDisplay') {
    return updateTimeToDisplaySpan('ui.load.full_display', name, event.nativeEvent);
  }
  if (event.nativeEvent.type === 'initialDisplay') {
    return updateTimeToDisplaySpan('ui.load.initial_display', name, event.nativeEvent);
  }
}

function updateTimeToDisplaySpan(op: string, name: string, event: RNSentryOnDrawNextFrameEvent): void {
  const activeSpan = getActiveSpan();
  if (!activeSpan) {
    logger.warn(`[TimeToDisplay] No active span found for ${op}.`);
    return;
  }

  if (!(activeSpan instanceof SpanClass)) {
    logger.warn(`[TimeToDisplay] Active span is not instance of Span class.`);
    return;
  }

  const existingSpan = activeSpan.spanRecorder?.spans.find((span) => spanToJSON(span).op === op);
  if (!existingSpan) {
    logger.debug(`[TimeToDisplay] No existing span found for ${op}, creating a new one.`);
  }

  const span = existingSpan || startInactiveSpan({
    op,
    name: name
      || op === 'ui.load.initial_display' && 'Time To Initial Display'
      || op === 'ui.load.full_display' && 'Time To Full Display'
      || 'Unknown Time To Display',
    startTimestamp: spanToJSON(activeSpan).start_timestamp,
  });


  if (!span) {
    logger.warn(`[TimeToDisplay] No span found or created, possibly performance is disabled.`);
    return;
  }

  if (spanToJSON(span).timestamp) {
    logger.warn(`[TimeToDisplay] ${spanToJSON(span).description} span end timestamp manually overwritten.`);
    span.endTimestamp = event.newFrameTimestampInSeconds;
  } else {
    span.end(event.newFrameTimestampInSeconds);
  }
  span.setStatus('ok');
  logger.debug(`[TimeToDisplay] ${spanToJSON(span).description} span updated with end timestamp.`);

  if (op === 'ui.load.full_display') {
    const spanEnd = spanToJSON(span).timestamp;
    const spanStart = spanToJSON(span).start_timestamp;
    if (!spanEnd || !spanStart) {
      return;
    }

    setMeasurement('time_to_full_display', (spanEnd - spanStart) * 1000, 'millisecond');
  }
}

/**
 * Starts a new span for the initial display.
 */
export function startTimeToInitialDisplaySpan(
  options?: Exclude<StartSpanOptions, 'op' | 'name'> & { name?: string },
): Span | undefined {
  const initialDisplaySpan = startInactiveSpan({
    op: 'ui.load.initial_display',
    name: 'Time To Initial Display',
    ...options,
  });

  return initialDisplaySpan;
}

/**
 * Starts a new span for the full display.
 */
export function startTimeToFullDisplaySpan(
  options?: Exclude<StartSpanOptions, 'op' | 'name'> & { name?: string, timeoutMs?: number },
): Span | undefined {
  const initialDisplaySpan = startInactiveSpan({
    op: 'ui.load.full_display',
    name: 'Time To Full Display',
    ...options,
  });
  // TODO: Add timeout handling
  return initialDisplaySpan;
}
