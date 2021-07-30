import { addGlobalEventProcessor, getCurrentHub } from "@sentry/core";
import { Transaction } from "@sentry/tracing";
import { Event, Integration } from "@sentry/types";
import { logger } from "@sentry/utils";
import { NativeFramesResponse } from "../definitions";

import { NATIVE } from "../wrapper";

export class FramesMetrics implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = "FramesMetrics";

  /**
   * @inheritDoc
   */
  public name: string = FramesMetrics.id;

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    // Do Nothing
  }

  public instrumentTransaction(transaction: Transaction): void {
    let startFrames: NativeFramesResponse | undefined;

    const originalFinish = transaction.finish;
    // @ts-ignore
    transaction.finish = async (endTimestamp?: number) => {
      const finishFrames = await NATIVE.getFrames();

      const measurements = {
        frames_total: {
          value: finishFrames.totalFrames - startFrames.totalFrames,
        },
        frames_slow: {
          value: finishFrames.slowFrames - startFrames.slowFrames,
        },
        frames_frozen: {
          value: finishFrames.frozenFrames - startFrames.frozenFrames,
        },
      };

      transaction.setMeasurements(measurements);

      originalFinish(endTimestamp);
    };

    NATIVE.getFrames().then((frames) => (startFrames = frames));
  }
}
