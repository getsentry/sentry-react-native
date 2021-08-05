import { Span, Transaction } from "@sentry/tracing";
import { EventProcessor, Measurements } from "@sentry/types";
import { logger, timestampInSeconds } from "@sentry/utils";

import { NativeFramesResponse } from "../definitions";
import { NATIVE } from "../wrapper";
import { instrumentChildSpanFinish } from "./utils";

interface FramesMeasurements extends Measurements {
  frames_total: {
    value: number;
  };
  frames_slow: {
    value: number;
  };
  frames_frozen: {
    value: number;
  };
}

const MARGIN_OF_ERROR_SECONDS = 0.05;

/**
 * Instrumentation to add native slow/frozen frames measurements onto transactions.
 */
export class NativeFramesInstrumentation {
  private _finishFrames: Map<
    string,
    { timestamp: number; nativeFrames: NativeFramesResponse }
  > = new Map();
  private _framesListeners: Map<string, () => void> = new Map();
  private _lastSpanFinishFrames?: {
    timestamp: number;
    nativeFrames: NativeFramesResponse;
  };

  public constructor(
    addGlobalEventProcessor: (e: EventProcessor) => void,
    doesExist: () => boolean
  ) {
    logger.log(
      "[ReactNativeTracing] Native frames instrumentation initialized."
    );

    addGlobalEventProcessor(async (event) => {
      if (!doesExist) {
        return event;
      }

      if (
        event.type === "transaction" &&
        typeof event.transaction !== "undefined" &&
        typeof event.contexts !== "undefined" &&
        typeof event.contexts.trace !== "undefined"
      ) {
        const traceContext = event.contexts.trace as {
          data?: { [key: string]: unknown };
          trace_id: string;
          name?: string;
          op?: string;
        };

        const traceId = traceContext.trace_id;

        if (
          typeof traceId === "string" &&
          typeof traceContext.data !== "undefined" &&
          typeof traceContext.data.__startFrames !== "undefined" &&
          typeof event.timestamp === "number"
        ) {
          const measurements = await this._getFramesMeasurements(
            traceId,
            event.timestamp,
            traceContext.data.__startFrames as NativeFramesResponse
          );

          if (!measurements) {
            logger.log(
              `[NativeFrames] Could not fetch native frames for ${traceContext.op} transaction ${event.transaction}. Not adding native frames measurements.`
            );
          } else {
            logger.log(
              `[Measurements] Adding measurements to ${
                traceContext.op
              } transaction ${event.transaction}: ${JSON.stringify(
                measurements,
                undefined,
                2
              )}`
            );

            event.measurements = {
              ...(event.measurements ?? {}),
              ...measurements,
            };

            this._finishFrames.delete(traceId);
          }

          delete traceContext.data.__startFrames;
        }
      }

      return event;
    });
  }

  /**
   * To be called when a transaction is started
   */
  public onTransactionStart(transaction: Transaction): void {
    void NATIVE.fetchNativeFrames().then((framesMetrics) => {
      if (framesMetrics) {
        transaction.setData("__startFrames", framesMetrics);
      }
    });

    instrumentChildSpanFinish(transaction, this._onSpanFinish.bind(this));
  }

  /**
   * To be called when a transaction is finished
   */
  public onTransactionFinish(transaction: Transaction): void {
    void this._fetchFramesForTransaction(transaction);
  }

  /**
   * Called on a span finish to fetch native frames to support transactions with trimEnd.
   */
  private _onSpanFinish(_: Span, endTimestamp?: number): void {
    if (!endTimestamp) {
      const timestamp = timestampInSeconds();

      void NATIVE.fetchNativeFrames().then((nativeFrames) => {
        if (nativeFrames) {
          this._lastSpanFinishFrames = {
            timestamp,
            nativeFrames,
          };
        }
      });
    }
  }

  /**
   * Returns the computed frames measurements and awaits for them if they are not ready yet.
   */
  private async _getFramesMeasurements(
    traceId: string,
    finalEndTimestamp: number,
    startFrames: NativeFramesResponse
  ): Promise<FramesMeasurements | null> {
    if (this._finishFrames.has(traceId)) {
      return this._prepareMeasurements(traceId, finalEndTimestamp, startFrames);
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this._framesListeners.delete(traceId);

        resolve(null);
      }, 2000);

      this._framesListeners.set(traceId, () => {
        resolve(
          this._prepareMeasurements(traceId, finalEndTimestamp, startFrames)
        );

        clearTimeout(timeout);
        this._framesListeners.delete(traceId);
      });
    });
  }

  /**
   * Returns the computed frames measurements given ready data
   */
  private _prepareMeasurements(
    traceId: string,
    finalEndTimestamp: number,
    startFrames: NativeFramesResponse
  ): FramesMeasurements | null {
    let finalFinishFrames: NativeFramesResponse | undefined;

    const finish = this._finishFrames.get(traceId);
    if (
      finish &&
      Math.abs(finish.timestamp - finalEndTimestamp) < MARGIN_OF_ERROR_SECONDS
    ) {
      finalFinishFrames = finish.nativeFrames;
    } else if (
      this._lastSpanFinishFrames &&
      Math.abs(this._lastSpanFinishFrames.timestamp - finalEndTimestamp) <
        MARGIN_OF_ERROR_SECONDS
    ) {
      // Fallback to the last span finish if it is within the margin of error of the actual finish timestamp.
      // This should be the case for trimEnd.
      finalFinishFrames = this._lastSpanFinishFrames.nativeFrames;
    } else {
      return null;
    }

    const measurements = {
      frames_total: {
        value: finalFinishFrames.totalFrames - startFrames.totalFrames,
      },
      frames_frozen: {
        value: finalFinishFrames.frozenFrames - startFrames.frozenFrames,
      },
      frames_slow: {
        value: finalFinishFrames.slowFrames - startFrames.slowFrames,
      },
    };

    return measurements;
  }

  /**
   * Fetch finish frames for a transaction at the current time. Calls any awaiting listeners.
   */
  private async _fetchFramesForTransaction(
    transaction: Transaction
  ): Promise<void> {
    const startFrames = transaction.data.__startFrames as
      | NativeFramesResponse
      | undefined;

    if (startFrames) {
      const timestamp = timestampInSeconds();
      const finishFrames = await NATIVE.fetchNativeFrames();

      if (finishFrames) {
        this._finishFrames.set(transaction.traceId, {
          nativeFrames: finishFrames,
          timestamp,
        });

        this._framesListeners.get(transaction.traceId)?.();

        setTimeout(() => {
          if (this._finishFrames.has(transaction.traceId)) {
            this._finishFrames.delete(transaction.traceId);

            logger.log(
              `[NativeFrames] Native frames timed out for ${transaction.op} transaction ${transaction.name}. Not adding native frames measurements.`
            );
          }
        }, 2000);
      }
    }
  }
}
