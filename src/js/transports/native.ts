import { Event, Response, Transport } from "@sentry/types";
import { PromiseBuffer, SentryError } from "@sentry/utils";

import { NATIVE } from "../wrapper";

/** Native Transport class implementation */
export class NativeTransport implements Transport {
  /** A simple buffer holding all requests. */
  protected readonly _buffer: PromiseBuffer<Response> = new PromiseBuffer(30);

  /**
   * @inheritDoc
   */
  public sendEvent(event: Event): PromiseLike<Response> {
    if (!this._buffer.isReady()) {
      return Promise.reject(
        new SentryError("Not adding Promise due to buffer limit reached.")
      );
    }
    return this._buffer.add(NATIVE.sendEvent(event));
  }

  /**
   * @inheritDoc
   */
  public close(timeout?: number): PromiseLike<boolean> {
    return this._buffer.drain(timeout);
  }
}
