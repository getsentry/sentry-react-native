import { EventProcessor, Integration } from "@sentry/types";
import { logger, timestampInSeconds } from "@sentry/utils";

/**
 *
 */
export class Stalls implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = "Stalls";

  /**
   * @inheritDoc
   */
  public name: string = Stalls.id;

  private _acceptableBusyTime: number = 0;
  private _totalStallTime: number = 0;
  private _stallCount: number = 0;
  private _longestStall: number = 0;
  private _lastInterval: number = 0;

  /**
   * @inheritDoc
   */
  public setupOnce(
    addGlobalEventProcessor: (callback: EventProcessor) => void
  ): void {
    this._acceptableBusyTime = 100;

    this._lastInterval = timestampInSeconds() * 1000;

    this._iteration();

    addGlobalEventProcessor((event) => {
      if (event.type === "transaction") {
        logger.log(`Stall Stats: [${JSON.stringify(this.getStats())}]`);
      }

      return event;
    });
  }

  /**
   *
   */
  public getStats(): {
    stallCount: number;
    _totalStallTime: number;
    _longestStall: number;
    _acceptableBusyTime: number;
  } {
    return {
      stallCount: this._stallCount,
      _totalStallTime: this._totalStallTime,
      _longestStall: this._longestStall,
      _acceptableBusyTime: this._acceptableBusyTime,
    };
  }

  /**
   *
   */
  public reset(): void {
    this._totalStallTime = 0;
    this._stallCount = 0;
    this._longestStall = 0;
    this._lastInterval = timestampInSeconds() * 1000;
  }

  /**
   *
   */
  private _iteration(): void {
    const now = timestampInSeconds() * 1000;
    const busyTime = now - this._lastInterval;

    if (busyTime >= this._acceptableBusyTime) {
      const stallTime = busyTime - this._acceptableBusyTime;
      this._stallCount += 1;
      this._totalStallTime += stallTime;
      this._longestStall = Math.max(this._longestStall, stallTime);
    }

    this._lastInterval = now;
    setTimeout(this._iteration.bind(this), this._acceptableBusyTime / 5);
  }
}
