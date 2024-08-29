import { spanToJSON } from '@sentry/core';
import type { Client, Event, Integration, Measurements, MeasurementUnit, Span } from '@sentry/types';
import { logger, timestampInSeconds } from '@sentry/utils';

import type { NativeFramesResponse } from '../../NativeRNSentry';
import type { ReactNativeClientOptions } from '../../options';
import { isRootSpan } from '../../utils/span';
import { NATIVE } from '../../wrapper';

/**
 * Timeout from the final native frames fetch to processing the associated transaction.
 * If the transaction is not processed by this time, the native frames will be dropped
 * and not added to the event.
 */
const FINAL_FRAMES_TIMEOUT_MS = 2000;

export interface FramesMeasurements extends Measurements {
  frames_total: { value: number; unit: MeasurementUnit };
  frames_slow: { value: number; unit: MeasurementUnit };
  frames_frozen: { value: number; unit: MeasurementUnit };
}

/** The listeners for each native frames response, keyed by traceId. This must be global to avoid closure issues and reading outdated values. */
const _framesListeners: Map<string, () => void> = new Map();

/** The native frames at the transaction finish time, keyed by traceId. This must be global to avoid closure issues and reading outdated values. */
const _finishFrames: Map<string, { timestamp: number; nativeFrames: NativeFramesResponse | null }> = new Map();

/**
 * A margin of error of 50ms is allowed for the async native bridge call.
 * Anything larger would reduce the accuracy of our frames measurements.
 */
const MARGIN_OF_ERROR_SECONDS = 0.05;

/**
 * Instrumentation to add native slow/frozen frames measurements onto transactions.
 */
export const nativeFramesIntegration = (): Integration => {
  const name: string = 'NativeFrames';

  /** The native frames at the finish time of the most recent span. */
  let _lastSpanFinishFrames:
    | {
        timestamp: number;
        nativeFrames: NativeFramesResponse;
      }
    | undefined = undefined;
  const _spanToNativeFramesAtStartMap: Map<string, NativeFramesResponse> = new Map();

  /**
   * Hooks into the client start and end span events.
   */
  const setup = (client: Client): void => {
    const { enableNativeFramesTracking } = client.getOptions() as ReactNativeClientOptions;

    if (enableNativeFramesTracking && !NATIVE.enableNative) {
      // Do not enable native frames tracking if native is not available.
      logger.warn(
        '[ReactNativeTracing] NativeFramesTracking is not available on the Web, Expo Go and other platforms without native modules.',
      );
      return;
    }

    if (!enableNativeFramesTracking && NATIVE.enableNative) {
      // Disable native frames tracking when native available and option is false.
      NATIVE.disableNativeFramesTracking();
      return;
    }

    if (!enableNativeFramesTracking) {
      return;
    }

    NATIVE.enableNativeFramesTracking();

    client.on('spanStart', _onSpanStart);
    client.on('spanEnd', _onSpanFinish);
    logger.log('[ReactNativeTracing] Native frames instrumentation initialized.');
  };

  /**
   * Adds frames measurements to an event. Called from a valid event processor.
   * Awaits for finish frames if needed.
   */
  const processEvent = (event: Event): Promise<Event> => {
    return _processEvent(event);
  };

  /**
   * Fetches the native frames in background if the given span is a root span.
   *
   * @param {Span} rootSpan - The span that has started.
   */
  const _onSpanStart = (rootSpan: Span): void => {
    if (!isRootSpan(rootSpan)) {
      return;
    }

    logger.debug(`[NativeFrames] Fetching frames for root span start (${rootSpan.spanContext().spanId}).`);

    NATIVE.fetchNativeFrames()
      .then(frames => {
        if (!frames) {
          logger.warn(
            `[NativeFrames] Fetched frames for root span start (${
              rootSpan.spanContext().spanId
            }), but no frames were returned.`,
          );
          return;
        }

        _spanToNativeFramesAtStartMap.set(rootSpan.spanContext().traceId, frames);
      })
      .then(undefined, error => {
        logger.error(
          `[NativeFrames] Error while fetching frames for root span start (${rootSpan.spanContext().spanId})`,
          error,
        );
      });
  };

  /**
   * Called on a span finish to fetch native frames to support transactions with trimEnd.
   * Only to be called when a span does not have an end timestamp.
   */
  const _onSpanFinish = (span: Span): void => {
    if (isRootSpan(span)) {
      return _onTransactionFinish(span);
    }

    const timestamp = timestampInSeconds();

    void NATIVE.fetchNativeFrames()
      .then(frames => {
        if (!frames) {
          return;
        }

        _lastSpanFinishFrames = {
          timestamp,
          nativeFrames: frames,
        };
      })
      .then(undefined, error => {
        logger.error(`[NativeFrames] Error while fetching frames for child span end.`, error);
      });
  };

  /**
   * To be called when a transaction is finished
   */
  const _onTransactionFinish = (span: Span): void => {
    _fetchFramesForTransaction(span).then(undefined, (reason: unknown) => {
      logger.error(
        `[NativeFrames] Error while fetching frames for root span start (${span.spanContext().spanId})`,
        reason,
      );
    });
  };

  /**
   * Returns the computed frames measurements and awaits for them if they are not ready yet.
   */
  const _getFramesMeasurements = (
    traceId: string,
    finalEndTimestamp: number,
    startFrames: NativeFramesResponse,
  ): Promise<FramesMeasurements | null> => {
    if (_finishFrames.has(traceId)) {
      logger.debug(`[NativeFrames] Native end frames already fetched for trace id (${traceId}).`);
      return Promise.resolve(_prepareMeasurements(traceId, finalEndTimestamp, startFrames));
    }

    return new Promise(resolve => {
      const timeout = setTimeout(() => {
        logger.debug(`[NativeFrames] Native end frames listener removed by timeout for trace id (${traceId}).`);
        _framesListeners.delete(traceId);

        resolve(null);
      }, 2000);

      _framesListeners.set(traceId, () => {
        logger.debug(`[NativeFrames] Native end frames listener called for trace id (${traceId}).`);
        resolve(_prepareMeasurements(traceId, finalEndTimestamp, startFrames));

        clearTimeout(timeout);
        _framesListeners.delete(traceId);
      });
    });
  };

  /**
   * Returns the computed frames measurements given ready data
   */
  const _prepareMeasurements = (
    traceId: string,
    finalEndTimestamp: number, // The actual transaction finish time.
    startFrames: NativeFramesResponse,
  ): FramesMeasurements | null => {
    let finalFinishFrames: NativeFramesResponse | undefined;

    const finish = _finishFrames.get(traceId);
    if (
      finish &&
      finish.nativeFrames &&
      // Must be in the margin of error of the actual transaction finish time (finalEndTimestamp)
      Math.abs(finish.timestamp - finalEndTimestamp) < MARGIN_OF_ERROR_SECONDS
    ) {
      logger.debug(`[NativeFrames] Using frames from root span end (traceId, ${traceId}).`);
      finalFinishFrames = finish.nativeFrames;
    } else if (
      _lastSpanFinishFrames &&
      Math.abs(_lastSpanFinishFrames.timestamp - finalEndTimestamp) < MARGIN_OF_ERROR_SECONDS
    ) {
      // Fallback to the last span finish if it is within the margin of error of the actual finish timestamp.
      // This should be the case for trimEnd.
      logger.debug(`[NativeFrames] Using native frames from last span end (traceId, ${traceId}).`);
      finalFinishFrames = _lastSpanFinishFrames.nativeFrames;
    } else {
      logger.warn(
        `[NativeFrames] Frames were collected within larger than margin of error delay for traceId (${traceId}). Dropping the inaccurate values.`,
      );
      return null;
    }

    const measurements = {
      frames_total: {
        value: finalFinishFrames.totalFrames - startFrames.totalFrames,
        unit: 'none',
      },
      frames_frozen: {
        value: finalFinishFrames.frozenFrames - startFrames.frozenFrames,
        unit: 'none',
      },
      frames_slow: {
        value: finalFinishFrames.slowFrames - startFrames.slowFrames,
        unit: 'none',
      },
    };

    if (
      measurements.frames_frozen.value <= 0 &&
      measurements.frames_slow.value <= 0 &&
      measurements.frames_total.value <= 0
    ) {
      logger.warn(
        `[NativeFrames] Detected zero slow or frozen frames. Not adding measurements to traceId (${traceId}).`,
      );
      return null;
    }

    return measurements;
  };

  /**
   * Fetch finish frames for a transaction at the current time. Calls any awaiting listeners.
   */
  const _fetchFramesForTransaction = async (span: Span): Promise<void> => {
    const traceId = spanToJSON(span).trace_id;
    if (!traceId) {
      return;
    }

    const startFrames = _spanToNativeFramesAtStartMap.get(span.spanContext().traceId);

    // This timestamp marks when the finish frames were retrieved. It should be pretty close to the transaction finish.
    const timestamp = timestampInSeconds();
    let finishFrames: NativeFramesResponse | null = null;
    if (startFrames) {
      finishFrames = await NATIVE.fetchNativeFrames();
    }

    _finishFrames.set(traceId, {
      nativeFrames: finishFrames,
      timestamp,
    });

    _framesListeners.get(traceId)?.();

    setTimeout(() => _cancelEndFrames(span), FINAL_FRAMES_TIMEOUT_MS);
  };

  /**
   * On a finish frames failure, we cancel the await.
   */
  const _cancelEndFrames = (span: Span): void => {
    const spanJSON = spanToJSON(span);
    const traceId = spanJSON.trace_id;
    if (!traceId) {
      return;
    }

    if (_finishFrames.has(traceId)) {
      _finishFrames.delete(traceId);

      logger.log(
        `[NativeFrames] Native frames timed out for ${spanJSON.op} transaction ${spanJSON.description}. Not adding native frames measurements.`,
      );
    }
  };

  /**
   * Adds frames measurements to an event. Called from a valid event processor.
   * Awaits for finish frames if needed.
   */
  const _processEvent = async (event: Event): Promise<Event> => {
    if (
      event.type !== 'transaction' ||
      !event.transaction ||
      !event.contexts ||
      !event.contexts.trace ||
      !event.timestamp ||
      !event.contexts.trace.trace_id
    ) {
      return event;
    }

    const traceOp = event.contexts.trace.op;
    const traceId = event.contexts.trace.trace_id;
    const startFrames = _spanToNativeFramesAtStartMap.get(traceId);
    _spanToNativeFramesAtStartMap.delete(traceId);
    if (!startFrames) {
      logger.warn(
        `[NativeFrames] Start frames of transaction ${event.transaction} (eventId, ${event.event_id}) are missing, but it already ended.`,
      );
      return event;
    }

    const measurements = await _getFramesMeasurements(traceId, event.timestamp, startFrames);

    if (!measurements) {
      logger.log(
        `[NativeFrames] Could not fetch native frames for ${traceOp} transaction ${event.transaction}. Not adding native frames measurements.`,
      );
      return event;
    }

    logger.log(
      `[Measurements] Adding measurements to ${traceOp} transaction ${event.transaction}: ${JSON.stringify(
        measurements,
        undefined,
        2,
      )}`,
    );

    event.measurements = {
      ...(event.measurements ?? {}),
      ...measurements,
    };

    _finishFrames.delete(traceId);

    return event;
  };

  return {
    name,
    setup,
    processEvent,
  };
};
