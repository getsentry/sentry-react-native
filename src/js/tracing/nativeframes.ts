import { spanToJSON } from '@sentry/core';
import type { Client, Event, Integration, Measurements, MeasurementUnit, Span } from '@sentry/types';
import { logger, timestampInSeconds } from '@sentry/utils';

import type { NativeFramesResponse } from '../NativeRNSentry';
import { isRootSpan } from '../utils/span';
import { NATIVE } from '../wrapper';

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
export class NativeFramesInstrumentation implements Integration {
  public name: string = 'NativeFramesInstrumentation';

  /** The native frames at the finish time of the most recent span. */
  private _lastSpanFinishFrames?: {
    timestamp: number;
    nativeFrames: NativeFramesResponse;
  };
  private _spanToNativeFramesAtStartMap: Map<string, NativeFramesResponse> = new Map();

  public constructor() {
    logger.log('[ReactNativeTracing] Native frames instrumentation initialized.');
  }

  /**
   * Hooks into the client start and end span events.
   */
  public setup(client: Client): void {
    client.on('spanStart', this._onSpanStart);
    client.on('spanEnd', this._onSpanFinish);
  }

  /**
   * Adds frames measurements to an event. Called from a valid event processor.
   * Awaits for finish frames if needed.
   */
  public processEvent(event: Event): Promise<Event> {
    return this._processEvent(event);
  }

  /**
   * Fetches the native frames in background if the given span is a root span.
   *
   * @param {Span} rootSpan - The span that has started.
   */
  private _onSpanStart = (rootSpan: Span): void => {
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

        this._spanToNativeFramesAtStartMap.set(rootSpan.spanContext().traceId, frames);
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
  private _onSpanFinish = (span: Span): void => {
    if (isRootSpan(span)) {
      return this._onTransactionFinish(span);
    }

    const timestamp = timestampInSeconds();

    void NATIVE.fetchNativeFrames()
      .then(frames => {
        if (!frames) {
          return;
        }

        this._lastSpanFinishFrames = {
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
  private _onTransactionFinish(span: Span): void {
    this._fetchFramesForTransaction(span).then(undefined, (reason: unknown) => {
      logger.error(
        `[NativeFrames] Error while fetching frames for root span start (${span.spanContext().spanId})`,
        reason,
      );
    });
  }

  /**
   * Returns the computed frames measurements and awaits for them if they are not ready yet.
   */
  private async _getFramesMeasurements(
    traceId: string,
    finalEndTimestamp: number,
    startFrames: NativeFramesResponse,
  ): Promise<FramesMeasurements | null> {
    if (_finishFrames.has(traceId)) {
      logger.debug(`[NativeFrames] Native end frames already fetched for trace id (${traceId}).`);
      return this._prepareMeasurements(traceId, finalEndTimestamp, startFrames);
    }

    return new Promise(resolve => {
      const timeout = setTimeout(() => {
        logger.debug(`[NativeFrames] Native end frames listener removed by timeout for trace id (${traceId}).`);
        _framesListeners.delete(traceId);

        resolve(null);
      }, 2000);

      _framesListeners.set(traceId, () => {
        logger.debug(`[NativeFrames] Native end frames listener called for trace id (${traceId}).`);
        resolve(this._prepareMeasurements(traceId, finalEndTimestamp, startFrames));

        clearTimeout(timeout);
        _framesListeners.delete(traceId);
      });
    });
  }

  /**
   * Returns the computed frames measurements given ready data
   */
  private _prepareMeasurements(
    traceId: string,
    finalEndTimestamp: number, // The actual transaction finish time.
    startFrames: NativeFramesResponse,
  ): FramesMeasurements | null {
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
      this._lastSpanFinishFrames &&
      Math.abs(this._lastSpanFinishFrames.timestamp - finalEndTimestamp) < MARGIN_OF_ERROR_SECONDS
    ) {
      // Fallback to the last span finish if it is within the margin of error of the actual finish timestamp.
      // This should be the case for trimEnd.
      logger.debug(`[NativeFrames] Using native frames from last span end (traceId, ${traceId}).`);
      finalFinishFrames = this._lastSpanFinishFrames.nativeFrames;
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
  }

  /**
   * Fetch finish frames for a transaction at the current time. Calls any awaiting listeners.
   */
  private async _fetchFramesForTransaction(span: Span): Promise<void> {
    const traceId = spanToJSON(span).trace_id;
    if (!traceId) {
      return;
    }

    const startFrames = this._spanToNativeFramesAtStartMap.get(span.spanContext().traceId);

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

    setTimeout(() => this._cancelEndFrames(span), FINAL_FRAMES_TIMEOUT_MS);
  }

  /**
   * On a finish frames failure, we cancel the await.
   */
  private _cancelEndFrames(span: Span): void {
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
  }

  /**
   * Adds frames measurements to an event. Called from a valid event processor.
   * Awaits for finish frames if needed.
   */
  private async _processEvent(event: Event): Promise<Event> {
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
    const startFrames = this._spanToNativeFramesAtStartMap.get(traceId);
    this._spanToNativeFramesAtStartMap.delete(traceId);
    if (!startFrames) {
      logger.warn(
        `[NativeFrames] Start frames of transaction ${event.transaction} (eventId, ${event.event_id}) are missing, but it already ended.`,
      );
      return event;
    }

    const measurements = await this._getFramesMeasurements(traceId, event.timestamp, startFrames);

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
  }
}
