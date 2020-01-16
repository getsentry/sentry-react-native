import { Event, Response, Transport } from "@sentry/types";
import { PromiseBuffer } from "@sentry/utils";

import { NATIVE } from "../wrapper";

/** Native Transport class implementation */
export class NativeTransport implements Transport {
  /** A simple buffer holding all requests. */
  protected readonly _buffer: PromiseBuffer<Response> = new PromiseBuffer(30);

  /**
   * @inheritDoc
   */
  public sendEvent(event: Event): PromiseLike<Response> {
    // TODO check if buffer is full like in node
    return this._buffer.add(NATIVE.sendEvent(event));
  }

  /**
   * @inheritDoc
   */
  public close(timeout?: number): PromiseLike<boolean> {
    return this._buffer.drain(timeout);
  }
}
