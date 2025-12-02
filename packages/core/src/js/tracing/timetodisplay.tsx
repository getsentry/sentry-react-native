/* eslint-disable max-lines */
import type { Span, StartSpanOptions } from '@sentry/core';
import { debug, fill, getActiveSpan, getSpanDescendants, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SPAN_STATUS_ERROR, SPAN_STATUS_OK, spanToJSON, startInactiveSpan } from '@sentry/core';
import * as React from 'react';
import { useState } from 'react';
import type { NativeFramesResponse } from '../NativeRNSentry';
import { NATIVE } from '../wrapper';
import { SPAN_ORIGIN_AUTO_UI_TIME_TO_DISPLAY, SPAN_ORIGIN_MANUAL_UI_TIME_TO_DISPLAY } from './origin';
import { getRNSentryOnDrawReporter } from './timetodisplaynative';
import { setSpanDurationAsMeasurement, setSpanDurationAsMeasurementOnSpan } from './utils';

/**
 * Timeout for fetching native frames
 */
const FETCH_FRAMES_TIMEOUT_MS = 2_000;

/**
 * Maximum time to keep frame data in memory before cleaning up.
 * Prevents memory leaks for spans that never complete.
 */
const FRAME_DATA_CLEANUP_TIMEOUT_MS = 60_000;

/**
 * Flags of active spans with manual initial display.
 */
export const manualInitialDisplaySpans = new WeakMap<Span, true>();

/**
 * Flag full display called before initial display for an active span.
 */
const fullDisplayBeforeInitialDisplay = new WeakMap<Span, true>();

interface FrameDataForSpan {
  startFrames: NativeFramesResponse | null;
  endFrames: NativeFramesResponse | null;
  cleanupTimeout?: ReturnType<typeof setTimeout>;
}

/**
 * Stores frame data for in-flight TTID/TTFD spans.
 * Entries are automatically cleaned up when spans end (in captureEndFramesAndAttachToSpan finally block).
 * As a safety mechanism, entries are also cleaned up after FRAME_DATA_CLEANUP_TIMEOUT_MS
 * to prevent memory leaks for spans that never complete.
 */
const spanFrameDataMap = new Map<string, FrameDataForSpan>();

export type TimeToDisplayProps = {
  children?: React.ReactNode;
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
  }

  const parentSpanId = activeSpan && spanToJSON(activeSpan).span_id;
  return <TimeToDisplay initialDisplay={props.record} parentSpanId={parentSpanId}>{props.children}</TimeToDisplay>;
}

/**
 * Component to measure time to full display.
 *
 * The initial display is recorded when the component prop `record` is true.
 *
 * <TimeToInitialDisplay record />
 */
export function TimeToFullDisplay(props: TimeToDisplayProps): React.ReactElement {
  const activeSpan = getActiveSpan();
  const parentSpanId = activeSpan && spanToJSON(activeSpan).span_id;
  return <TimeToDisplay fullDisplay={props.record} parentSpanId={parentSpanId}>{props.children}</TimeToDisplay>;
}

function TimeToDisplay(props: {
  children?: React.ReactNode;
  initialDisplay?: boolean;
  fullDisplay?: boolean;
  parentSpanId?: string;
}): React.ReactElement {
  const RNSentryOnDrawReporter = getRNSentryOnDrawReporter();
  return (
    <>
      <RNSentryOnDrawReporter
        initialDisplay={props.initialDisplay}
        fullDisplay={props.fullDisplay}
        parentSpanId={props.parentSpanId} />
      {props.children}
    </>
  );
}

/**
 * Starts a new span for the initial display.
 *
 * Returns current span if already exists in the currently active span.
 *
 * @deprecated Use `<TimeToInitialDisplay record={boolean}/>` component instead.
 */
export function startTimeToInitialDisplaySpan(
  options?: Omit<StartSpanOptions, 'op' | 'name'> & {
    name?: string;
    isAutoInstrumented?: boolean
  },
): Span | undefined {
  const activeSpan = getActiveSpan();
  if (!activeSpan) {
    debug.warn('[TimeToDisplay] No active span found to attach ui.load.initial_display to.');
    return undefined;
  }

  const existingSpan = getSpanDescendants(activeSpan).find((span) => spanToJSON(span).op === 'ui.load.initial_display');
  if (existingSpan) {
    debug.log('[TimeToDisplay] Found existing ui.load.initial_display span.');
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

  captureStartFramesForSpan(initialDisplaySpan.spanContext().spanId).catch((error) => {
    debug.log(`[TimeToDisplay] Failed to capture start frames for initial display span (${initialDisplaySpan.spanContext().spanId}).`, error);
  });

  if (options?.isAutoInstrumented) {
    initialDisplaySpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SPAN_ORIGIN_AUTO_UI_TIME_TO_DISPLAY);
  } else {
    manualInitialDisplaySpans.set(activeSpan, true);
    initialDisplaySpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SPAN_ORIGIN_MANUAL_UI_TIME_TO_DISPLAY);
  }

  return initialDisplaySpan;
}

/**
 * Starts a new span for the full display.
 *
 * Returns current span if already exists in the currently active span.
 *
 * @deprecated Use `<TimeToFullDisplay record={boolean}/>` component instead.
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
    debug.warn('[TimeToDisplay] No active span found to attach ui.load.full_display to.');
    return undefined;
  }

  const descendantSpans = getSpanDescendants(activeSpan);

  const initialDisplaySpan = descendantSpans.find((span) => spanToJSON(span).op === 'ui.load.initial_display');
  if (!initialDisplaySpan) {
    debug.warn('[TimeToDisplay] No initial display span found to attach ui.load.full_display to.');
    return undefined;
  }

  const existingSpan = descendantSpans.find((span) => spanToJSON(span).op === 'ui.load.full_display');
  if (existingSpan) {
    debug.log('[TimeToDisplay] Found existing ui.load.full_display span.');
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

  captureStartFramesForSpan(fullDisplaySpan.spanContext().spanId).catch((error) => {
    debug.log(`[TimeToDisplay] Failed to capture start frames for full display span (${fullDisplaySpan.spanContext().spanId}).`, error);
  });

  const timeout = setTimeout(() => {
    if (spanToJSON(fullDisplaySpan).timestamp) {
      return;
    }
    fullDisplaySpan.setStatus({ code: SPAN_STATUS_ERROR, message: 'deadline_exceeded' });

    captureEndFramesAndAttachToSpan(fullDisplaySpan).then(() => {
      debug.log(`[TimeToDisplay] ${fullDisplaySpan.spanContext().spanId} span updated with frame data.`);
      fullDisplaySpan.end(spanToJSON(initialDisplaySpan).timestamp);
      setSpanDurationAsMeasurement('time_to_full_display', fullDisplaySpan);
    }).catch(() => {
      debug.warn(`[TimeToDisplay] Failed to capture end frames for full display span (${fullDisplaySpan.spanContext().spanId}).`);
      fullDisplaySpan.end(spanToJSON(initialDisplaySpan).timestamp);
      setSpanDurationAsMeasurement('time_to_full_display', fullDisplaySpan);
    });

    debug.warn('[TimeToDisplay] Full display span deadline_exceeded.');
  }, options.timeoutMs);

  fill(fullDisplaySpan, 'end', (originalEnd: Span['end']) => (endTimestamp?: Parameters<Span['end']>[0]) => {
    clearTimeout(timeout);
    originalEnd.call(fullDisplaySpan, endTimestamp);
  });

  if (options?.isAutoInstrumented) {
    fullDisplaySpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SPAN_ORIGIN_AUTO_UI_TIME_TO_DISPLAY);
  } else {
    fullDisplaySpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SPAN_ORIGIN_MANUAL_UI_TIME_TO_DISPLAY);
  }

  return fullDisplaySpan;
}

/**
 *
 */
export function updateInitialDisplaySpan(
  frameTimestampSeconds: number,
  {
    activeSpan = getActiveSpan(),
    span = startTimeToInitialDisplaySpan(),
  }: {
    activeSpan?: Span;
    /**
     * Time to initial display span to update.
     */
    span?: Span;
  } = {}): void {
  if (!span) {
    debug.warn('[TimeToDisplay] No span found or created, possibly performance is disabled.');
    return;
  }

  if (!activeSpan) {
    debug.warn('[TimeToDisplay] No active span found to attach ui.load.initial_display to.');
    return;
  }

  if (spanToJSON(span).parent_span_id !== spanToJSON(activeSpan).span_id) {
    debug.warn('[TimeToDisplay] Initial display span is not a child of current active span.');
    return;
  }

  if (spanToJSON(span).timestamp) {
    debug.warn(`[TimeToDisplay] ${spanToJSON(span).description} span already ended.`);
    return;
  }

  captureEndFramesAndAttachToSpan(span).then(() => {
    span.end(frameTimestampSeconds);
    span.setStatus({ code: SPAN_STATUS_OK });
    debug.log(`[TimeToDisplay] ${spanToJSON(span).description} span updated with end timestamp and frame data.`);

    if (fullDisplayBeforeInitialDisplay.has(activeSpan)) {
      fullDisplayBeforeInitialDisplay.delete(activeSpan);
      debug.log(`[TimeToDisplay] Updating full display with initial display (${span.spanContext().spanId}) end.`);
      updateFullDisplaySpan(frameTimestampSeconds, span);
    }

    setSpanDurationAsMeasurementOnSpan('time_to_initial_display', span, activeSpan);
  }).catch((error) => {
    debug.log('[TimeToDisplay] Failed to capture frame data for initial display span.', error);
    span.end(frameTimestampSeconds);
    span.setStatus({ code: SPAN_STATUS_OK });

    if (fullDisplayBeforeInitialDisplay.has(activeSpan)) {
      fullDisplayBeforeInitialDisplay.delete(activeSpan);
      debug.log(`[TimeToDisplay] Updating full display with initial display (${span.spanContext().spanId}) end.`);
      updateFullDisplaySpan(frameTimestampSeconds, span);
    }

    setSpanDurationAsMeasurementOnSpan('time_to_initial_display', span, activeSpan);
  });
}

function updateFullDisplaySpan(frameTimestampSeconds: number, passedInitialDisplaySpan?: Span): void {
  const activeSpan = getActiveSpan();
  if (!activeSpan) {
    debug.warn('[TimeToDisplay] No active span found to update ui.load.full_display in.');
    return;
  }

  const existingInitialDisplaySpan = passedInitialDisplaySpan
    || getSpanDescendants(activeSpan).find((span) => spanToJSON(span).op === 'ui.load.initial_display');
  const initialDisplayEndTimestamp = existingInitialDisplaySpan && spanToJSON(existingInitialDisplaySpan).timestamp;
  if (!initialDisplayEndTimestamp) {
    fullDisplayBeforeInitialDisplay.set(activeSpan, true);
    debug.warn(`[TimeToDisplay] Full display called before initial display for active span (${activeSpan.spanContext().spanId}).`);
    return;
  }

  const span = startTimeToFullDisplaySpan({
    isAutoInstrumented: true,
  });
  if (!span) {
    debug.warn('[TimeToDisplay] No TimeToFullDisplay span found or created, possibly performance is disabled.');
    return;
  }

  const spanJSON = spanToJSON(span);
  if (spanJSON.timestamp) {
    debug.warn(`[TimeToDisplay] ${spanJSON.description} (${spanJSON.span_id}) span already ended.`);
    return;
  }

  captureEndFramesAndAttachToSpan(span).then(() => {
    const endTimestamp = initialDisplayEndTimestamp > frameTimestampSeconds ? initialDisplayEndTimestamp : frameTimestampSeconds;

    if (initialDisplayEndTimestamp > frameTimestampSeconds) {
      debug.warn('[TimeToDisplay] Using initial display end. Full display end frame timestamp is before initial display end.');
    }

    span.end(endTimestamp);
    span.setStatus({ code: SPAN_STATUS_OK });
    debug.log(`[TimeToDisplay] ${spanJSON.description} (${spanJSON.span_id}) span updated with end timestamp and frame data.`);

    setSpanDurationAsMeasurement('time_to_full_display', span);
  }).catch((error) => {
    debug.log('[TimeToDisplay] Failed to capture frame data for full display span.', error);
    const endTimestamp = initialDisplayEndTimestamp > frameTimestampSeconds ? initialDisplayEndTimestamp : frameTimestampSeconds;

    span.end(endTimestamp);
    span.setStatus({ code: SPAN_STATUS_OK });
    setSpanDurationAsMeasurement('time_to_full_display', span);
  });
}

/**
 * Creates a new TimeToFullDisplay component which triggers the full display recording every time the component is focused.
 */
export function createTimeToFullDisplay({
  useFocusEffect,
}: {
  /**
   * `@react-navigation/native` useFocusEffect hook.
   */
  useFocusEffect: (callback: () => void) => void
}): React.ComponentType<TimeToDisplayProps> {
  return createTimeToDisplay({ useFocusEffect, Component: TimeToFullDisplay });
}

/**
 * Creates a new TimeToInitialDisplay component which triggers the initial display recording every time the component is focused.
 */
export function createTimeToInitialDisplay({
  useFocusEffect,
}: {
  useFocusEffect: (callback: () => void) => void
}): React.ComponentType<TimeToDisplayProps> {
  return createTimeToDisplay({ useFocusEffect, Component: TimeToInitialDisplay });
}

function createTimeToDisplay({
  useFocusEffect,
  Component,
}: {
  /**
   * `@react-navigation/native` useFocusEffect hook.
   */
  useFocusEffect: (callback: () => void) => void;
  Component: typeof TimeToFullDisplay | typeof TimeToInitialDisplay;
}): React.ComponentType<TimeToDisplayProps> {
  const TimeToDisplayWrapper = (props: TimeToDisplayProps): React.ReactElement => {
    const [focused, setFocused] = useState(false);

    useFocusEffect(() => {
        setFocused(true);
        return () => {
          setFocused(false);
        };
    });

    return <Component {...props} record={focused && props.record} />;
  };

  TimeToDisplayWrapper.displayName = 'TimeToDisplayWrapper';
  return TimeToDisplayWrapper;
}

/**
 * Attaches frame data to a span's data object.
 */
function attachFrameDataToSpan(span: Span, startFrames: NativeFramesResponse, endFrames: NativeFramesResponse): void {
  const totalFrames = endFrames.totalFrames - startFrames.totalFrames;
  const slowFrames = endFrames.slowFrames - startFrames.slowFrames;
  const frozenFrames = endFrames.frozenFrames - startFrames.frozenFrames;

  if (totalFrames <= 0 && slowFrames <= 0 && frozenFrames <= 0) {
    debug.warn(`[TimeToDisplay] Detected zero slow or frozen frames. Not adding measurements to span (${span.spanContext().spanId}).`);
    return;
  }
  span.setAttribute('frames.total', totalFrames);
  span.setAttribute('frames.slow', slowFrames);
  span.setAttribute('frames.frozen', frozenFrames);

  debug.log('[TimeToDisplay] Attached frame data to span.', {
    spanId: span.spanContext().spanId,
    frameData: {
      total: totalFrames,
      slow: slowFrames,
      frozen: frozenFrames,
    },
  });
}

/**
 * Captures start frames for a time-to-display span
 */
async function captureStartFramesForSpan(spanId: string): Promise<void> {
  if (!NATIVE.enableNative) {
    return;
  }

  try {
    const startFrames = await fetchNativeFramesWithTimeout();

    // Set up automatic cleanup as a safety mechanism for spans that never complete
    const cleanupTimeout = setTimeout(() => {
      const entry = spanFrameDataMap.get(spanId);
      if (entry) {
        spanFrameDataMap.delete(spanId);
        debug.log(`[TimeToDisplay] Cleaned up stale frame data for span ${spanId} after timeout.`);
      }
    }, FRAME_DATA_CLEANUP_TIMEOUT_MS);

    if (!spanFrameDataMap.has(spanId)) {
      spanFrameDataMap.set(spanId, { startFrames: null, endFrames: null, cleanupTimeout });
    }
    const frameData = spanFrameDataMap.get(spanId)!;
    frameData.startFrames = startFrames;
    frameData.cleanupTimeout = cleanupTimeout;
    debug.log(`[TimeToDisplay] Captured start frames for span ${spanId}.`, startFrames);
  } catch (error) {
    debug.log(`[TimeToDisplay] Failed to capture start frames for span ${spanId}.`, error);
  }
}

/**
 * Captures end frames and attaches frame data to span
 */
async function captureEndFramesAndAttachToSpan(span: Span): Promise<void> {
  if (!NATIVE.enableNative) {
    return;
  }

  const spanId = span.spanContext().spanId;
  const frameData = spanFrameDataMap.get(spanId);

  if (!frameData?.startFrames) {
    debug.log(`[TimeToDisplay] No start frames found for span ${spanId}, skipping frame data collection.`);
    return;
  }

  try {
    const endFrames = await fetchNativeFramesWithTimeout();
    frameData.endFrames = endFrames;

    attachFrameDataToSpan(span, frameData.startFrames, endFrames);

    debug.log(`[TimeToDisplay] Captured and attached end frames for span ${spanId}.`, endFrames);
  } catch (error) {
    debug.log(`[TimeToDisplay] Failed to capture end frames for span ${spanId}.`, error);
  } finally {
    // Clear the cleanup timeout since we're cleaning up now
    if (frameData.cleanupTimeout) {
      clearTimeout(frameData.cleanupTimeout);
    }
    spanFrameDataMap.delete(spanId);
  }
}

/**
 * Fetches native frames with a timeout
 */
function fetchNativeFramesWithTimeout(): Promise<NativeFramesResponse> {
  return new Promise<NativeFramesResponse>((resolve, reject) => {
    NATIVE.fetchNativeFrames()
      .then(value => {
        if (!value) {
          reject('Native frames response is null.');
          return;
        }
        resolve(value);
      })
      .then(undefined, (error: unknown) => {
        reject(error);
      });

    setTimeout(() => {
      reject('Fetching native frames took too long. Dropping frames.');
    }, FETCH_FRAMES_TIMEOUT_MS);
  });
}
