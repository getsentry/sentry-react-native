import type { Client, Event, Integration, Measurements, MeasurementUnit, Span } from '@sentry/core';

import { debug, getRootSpan, spanIsSampled, spanToJSON, timestampInSeconds } from '@sentry/core';

import type { NativeFramesResponse } from '../../NativeRNSentry';

import { AsyncExpiringMap } from '../../utils/AsyncExpiringMap';
import { isRootSpan } from '../../utils/span';
import { NATIVE } from '../../wrapper';

/**
 * Timeout from the start of a span to fetching the associated native frames.
 */
const FETCH_FRAMES_TIMEOUT_MS = 2_000;

/**
 * This is the time end frames data from the native layer will be
 * kept in memory and waiting for the event processing. This ensures that spans
 * which are never processed are not leaking memory.
 */
const END_FRAMES_TIMEOUT_MS = 2_000;

/**
 * This is the time start frames data from the native layer will be
 * kept in memory and waiting for span end. This ensures that spans
 * which never end or are not processed are not leaking memory.
 */
const START_FRAMES_TIMEOUT_MS = 60_000;

/**
 * A margin of error of 50ms is allowed for the async native bridge call.
 * Anything larger would reduce the accuracy of our frames measurements.
 */
const MARGIN_OF_ERROR_SECONDS = 0.05;

const INTEGRATION_NAME = 'NativeFrames';

export interface FramesMeasurements extends Measurements {
  frames_total: { value: number; unit: MeasurementUnit };
  frames_slow: { value: number; unit: MeasurementUnit };
  frames_frozen: { value: number; unit: MeasurementUnit };
}

interface NativeFramesResponseWithTimestamp {
  timestamp: number;
  nativeFrames: NativeFramesResponse;
}

export const createNativeFramesIntegrations = (enable: boolean | undefined): Integration | undefined => {
  if (!enable && NATIVE.enableNative) {
    // On Android this will free up resource when JS reloaded (native modules stay) and thus JS side of the SDK reinitialized.
    NATIVE.disableNativeFramesTracking();
    return undefined;
  }

  return nativeFramesIntegration();
};

/**
 * Instrumentation to add native slow/frozen frames measurements onto transactions
 * and frame data (frames.total, frames.slow, frames.frozen) onto all spans.
 */
export const nativeFramesIntegration = (): Integration => {
  /** The native frames at the finish time of the most recent child span, keyed by root span ID.
   *  Stores promises so the data is available for processEvent to await even before
   *  the async native bridge call completes. */
  const _lastChildSpanEndFramesByRootSpan: AsyncExpiringMap<string, NativeFramesResponseWithTimestamp | null> =
    new AsyncExpiringMap({ ttl: START_FRAMES_TIMEOUT_MS });
  const _spanToNativeFramesAtStartMap: AsyncExpiringMap<string, NativeFramesResponse | null> = new AsyncExpiringMap({
    ttl: START_FRAMES_TIMEOUT_MS,
  });
  const _spanToNativeFramesAtEndMap: AsyncExpiringMap<string, NativeFramesResponseWithTimestamp | null> =
    new AsyncExpiringMap({ ttl: END_FRAMES_TIMEOUT_MS });

  /**
   * Hooks into the client start and end span events.
   */
  const setup = (client: Client): void => {
    if (!NATIVE.enableNative) {
      debug.warn(
        `[${INTEGRATION_NAME}] This is not available on the Web, Expo Go and other platforms without native modules.`,
      );
      return undefined;
    }

    NATIVE.enableNativeFramesTracking();
    client.on('spanStart', fetchStartFramesForSpan);
    client.on('spanEnd', fetchEndFramesForSpan);
  };

  const fetchStartFramesForSpan = (span: Span): void => {
    if (!spanIsSampled(span)) {
      return;
    }

    const spanId = span.spanContext().spanId;
    const spanType = isRootSpan(span) ? 'root' : 'child';
    debug.log(`[${INTEGRATION_NAME}] Fetching frames for ${spanType} span start (${spanId}).`);

    _spanToNativeFramesAtStartMap.set(
      spanId,
      new Promise<NativeFramesResponse | null>(resolve => {
        fetchNativeFrames()
          .then(frames => resolve(frames))
          .then(undefined, error => {
            debug.log(`[${INTEGRATION_NAME}] Error while fetching native frames.`, error);
            resolve(null);
          });
      }),
    );
  };

  /**
   * Fetches end frames for a span and attaches frame data as span attributes.
   *
   * Note: This makes one native bridge call per span end. While this creates O(n) calls
   * for n spans, it's necessary for accuracy. Frame counts are cumulative and continuously
   * incrementing, so each span needs the exact frame count at its end time. Caching would
   * produce incorrect deltas. The native bridge calls are async and non-blocking.
   */
  const fetchEndFramesForSpan = async (span: Span): Promise<void> => {
    const spanId = span.spanContext().spanId;
    const hasStartFrames = _spanToNativeFramesAtStartMap.has(spanId);

    if (!hasStartFrames) {
      // We don't have start frames, won't be able to calculate the difference.
      return;
    }

    // For child spans: immediately store a promise for fallback end frames before any awaits,
    // so processEvent can find and await it even if this async function hasn't completed yet.
    // Uses the actual span timestamp (not wall-clock time) so it matches the trimmed event.timestamp
    // for idle transactions. Scoped per root span to avoid concurrent transaction interference.
    let childEndFramesPromise: Promise<NativeFramesResponse> | undefined;
    if (!isRootSpan(span)) {
      const rootSpanId = getRootSpan(span).spanContext().spanId;
      const spanTimestamp = spanToJSON(span).timestamp;
      if (spanTimestamp) {
        childEndFramesPromise = fetchNativeFrames();
        _lastChildSpanEndFramesByRootSpan.set(
          rootSpanId,
          childEndFramesPromise
            .then(frames => ({ timestamp: spanTimestamp, nativeFrames: frames }))
            .then(undefined, () => null),
        );
      }
    }

    if (isRootSpan(span)) {
      // Root spans: Store end frames for transaction measurements (backward compatibility)
      const timestamp = timestampInSeconds();
      debug.log(`[${INTEGRATION_NAME}] Fetch frames for root span end (${spanId}).`);
      _spanToNativeFramesAtEndMap.set(
        spanId,
        new Promise<NativeFramesResponseWithTimestamp | null>(resolve => {
          fetchNativeFrames()
            .then(frames => {
              resolve({
                timestamp,
                nativeFrames: frames,
              });
            })
            .then(undefined, error => {
              debug.log(`[${INTEGRATION_NAME}] Error while fetching native frames.`, error);
              resolve(null);
            });
        }),
      );
    }

    // All spans (root and child): Attach frame data as span attributes
    try {
      const startFrames = await _spanToNativeFramesAtStartMap.get(spanId);
      if (!startFrames) {
        debug.log(`[${INTEGRATION_NAME}] No start frames found for span ${spanId}, skipping frame data.`);
        return;
      }

      // For child spans, reuse the already-kicked-off promise to avoid a redundant native bridge call.
      // For root spans, this is the second call to fetchNativeFrames() for the same span.
      // The calls are very close together (microseconds apart), so inconsistency is minimal.
      const endFrames = childEndFramesPromise ? await childEndFramesPromise : await fetchNativeFrames();

      // Calculate deltas
      const totalFrames = endFrames.totalFrames - startFrames.totalFrames;
      const slowFrames = endFrames.slowFrames - startFrames.slowFrames;
      const frozenFrames = endFrames.frozenFrames - startFrames.frozenFrames;

      // Only attach if we have meaningful data
      if (totalFrames > 0 || slowFrames > 0 || frozenFrames > 0) {
        span.setAttribute('frames.total', totalFrames);
        span.setAttribute('frames.slow', slowFrames);
        span.setAttribute('frames.frozen', frozenFrames);
        debug.log(
          `[${INTEGRATION_NAME}] Attached frame data to span ${spanId}: total=${totalFrames}, slow=${slowFrames}, frozen=${frozenFrames}`,
        );

        const spanJson = spanToJSON(span);
        if (spanJson.start_timestamp && spanJson.timestamp) {
          try {
            const delay = await fetchNativeFramesDelay(spanJson.start_timestamp, spanJson.timestamp);
            if (delay != null) {
              span.setAttribute('frames.delay', delay);
            }
          } catch (delayError) {
            debug.log(`[${INTEGRATION_NAME}] Error while fetching frames delay for span ${spanId}.`, delayError);
          }
        }
      }
    } catch (error) {
      debug.log(`[${INTEGRATION_NAME}] Error while capturing end frames for span ${spanId}.`, error);
    }
  };

  const processEvent = async (event: Event): Promise<Event> => {
    if (
      event.type !== 'transaction' ||
      !event.transaction ||
      !event.contexts?.trace ||
      !event.timestamp ||
      !event.contexts.trace.span_id
    ) {
      return event;
    }

    const traceOp = event.contexts.trace.op;
    const spanId = event.contexts.trace.span_id;
    const startFrames = await _spanToNativeFramesAtStartMap.pop(spanId);
    if (!startFrames) {
      debug.warn(
        `[${INTEGRATION_NAME}] Start frames of transaction ${event.transaction} (eventId, ${event.event_id}) are missing, but the transaction already ended.`,
      );
      return event;
    }

    const endFrames = await _spanToNativeFramesAtEndMap.pop(spanId);
    const lastChildFrames = await _lastChildSpanEndFramesByRootSpan.pop(spanId);
    let finalEndFrames: NativeFramesResponse | undefined;

    if (endFrames && isClose(endFrames.timestamp, event.timestamp)) {
      // Must be in the margin of error of the actual transaction finish time (finalEndTimestamp)
      debug.log(`[${INTEGRATION_NAME}] Using frames from root span end (spanId, ${spanId}).`);
      finalEndFrames = endFrames.nativeFrames;
    } else if (lastChildFrames && isClose(lastChildFrames.timestamp, event.timestamp)) {
      // Fallback to the last child span finish if it is within the margin of error of the actual finish timestamp.
      // This handles idle transactions where event.timestamp is trimmed to the last child span's end time.
      debug.log(`[${INTEGRATION_NAME}] Using native frames from last child span end (spanId, ${spanId}).`);
      finalEndFrames = lastChildFrames.nativeFrames;
    } else {
      debug.warn(
        `[${INTEGRATION_NAME}] Frames were collected within larger than margin of error delay for spanId (${spanId}). Dropping the inaccurate values.`,
      );
      return event;
    }

    const measurements = {
      frames_total: {
        value: finalEndFrames.totalFrames - startFrames.totalFrames,
        unit: 'none',
      },
      frames_frozen: {
        value: finalEndFrames.frozenFrames - startFrames.frozenFrames,
        unit: 'none',
      },
      frames_slow: {
        value: finalEndFrames.slowFrames - startFrames.slowFrames,
        unit: 'none',
      },
    };

    if (
      measurements.frames_frozen.value <= 0 &&
      measurements.frames_slow.value <= 0 &&
      measurements.frames_total.value <= 0
    ) {
      debug.warn(
        `[${INTEGRATION_NAME}] Detected zero slow or frozen frames. Not adding measurements to spanId (${spanId}).`,
      );
      return event;
    }

    debug.log(
      `[${INTEGRATION_NAME}] Adding measurements to ${traceOp} transaction ${event.transaction}: ${JSON.stringify(
        measurements,
        undefined,
        2,
      )}`,
    );
    event.measurements = {
      ...(event.measurements ?? {}),
      ...measurements,
    };
    return event;
  };

  return {
    name: INTEGRATION_NAME,
    setup,
    processEvent,
  };
};

function withNativeBridgeTimeout<T>(promise: PromiseLike<T>, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(timeoutMessage);
      }
    }, FETCH_FRAMES_TIMEOUT_MS);

    promise
      .then(value => {
        if (settled) {
          return;
        }
        clearTimeout(timeoutId);
        settled = true;
        resolve(value);
      })
      .then(undefined, error => {
        if (settled) {
          return;
        }
        clearTimeout(timeoutId);
        settled = true;
        reject(error);
      });
  });
}

function fetchNativeFrames(): Promise<NativeFramesResponse> {
  return new Promise<NativeFramesResponse>((resolve, reject) => {
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject('Fetching native frames took too long. Dropping frames.');
      }
    }, FETCH_FRAMES_TIMEOUT_MS);

    NATIVE.fetchNativeFrames()
      .then(value => {
        if (settled) {
          return;
        }
        clearTimeout(timeoutId);
        settled = true;

        if (!value) {
          reject('Native frames response is null.');
          return;
        }
        resolve(value);
      })
      .then(undefined, error => {
        if (settled) {
          return;
        }
        clearTimeout(timeoutId);
        settled = true;
        reject(error);
      });
  });
}

function fetchNativeFramesDelay(startTimestampSeconds: number, endTimestampSeconds: number): Promise<number | null> {
  return withNativeBridgeTimeout(
    NATIVE.fetchNativeFramesDelay(startTimestampSeconds, endTimestampSeconds),
    'Fetching native frames delay took too long.',
  );
}

function isClose(t1: number, t2: number): boolean {
  return Math.abs(t1 - t2) < MARGIN_OF_ERROR_SECONDS;
}
