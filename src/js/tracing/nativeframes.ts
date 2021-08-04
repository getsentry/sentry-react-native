import { Transaction } from "@sentry/tracing";
import { EventProcessor, Measurements } from "@sentry/types";
import { logger } from "@sentry/utils";

import { NativeFramesResponse } from "../definitions";
import { NATIVE } from "../wrapper";

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

/**
 *
 */
export class NativeFramesInstrumentation {
  private _framesMeasurements: Map<string, FramesMeasurements> = new Map();
  private _framesListeners: Map<string, () => void> = new Map();

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
          typeof traceContext.data.__startFrames !== "undefined"
        ) {
          const measurements = await this._getFramesMeasurements(traceId);

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

            this._framesMeasurements.delete(traceId);
          }

          delete traceContext.data.__startFrames;
        }
      }

      return event;
    });
  }

  /**
   *
   */
  public async onTransactionStart(transaction: Transaction): Promise<void> {
    const framesMetrics = await NATIVE.fetchNativeFrames();

    if (framesMetrics) {
      transaction.setData("__startFrames", framesMetrics);
    }
  }

  /**
   *
   */
  public onTransactionFinish(transaction: Transaction): void {
    void this._fetchFramesForTransaction(transaction);
  }

  /**
   *
   */
  private async _getFramesMeasurements(
    traceId: string
  ): Promise<FramesMeasurements | null> {
    const framesMeasurements = this._framesMeasurements.get(traceId);

    if (framesMeasurements) {
      return framesMeasurements;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this._framesListeners.delete(traceId);

        resolve(null);
      }, 2000);

      this._framesListeners.set(traceId, () => {
        const framesMeasurements = this._framesMeasurements.get(traceId);

        resolve(framesMeasurements ?? null);

        clearTimeout(timeout);
        this._framesListeners.delete(traceId);
      });
    });
  }

  /**
   *
   */
  private async _fetchFramesForTransaction(
    transaction: Transaction
  ): Promise<void> {
    const startFrames = transaction.data.__startFrames as
      | NativeFramesResponse
      | undefined;

    if (startFrames) {
      const finishFrames = await NATIVE.fetchNativeFrames();

      if (finishFrames) {
        const framesMeasurements = {
          frames_total: {
            value: finishFrames.totalFrames - startFrames.totalFrames,
          },
          frames_frozen: {
            value: finishFrames.frozenFrames - startFrames.frozenFrames,
          },
          frames_slow: {
            value: finishFrames.slowFrames - startFrames.slowFrames,
          },
        };

        this._framesMeasurements.set(transaction.traceId, framesMeasurements);

        this._framesListeners.get(transaction.traceId)?.();

        setTimeout(() => {
          if (this._framesMeasurements.has(transaction.traceId)) {
            this._framesMeasurements.delete(transaction.traceId);

            logger.log(
              `[NativeFrames] Native frames timed out for ${transaction.op} transaction ${transaction.name}. Not adding native frames measurements.`
            );
          }
        }, 2000);
      }
    }
  }
}
