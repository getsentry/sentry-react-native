import { Event, Response, Transport } from '@sentry/types';
import { makePromiseBuffer, PromiseBuffer } from '@sentry/utils';

import { NATIVE } from '../wrapper';

/** Native Transport class implementation */
export class NativeTransport implements Transport {
  /** A simple buffer holding all requests. */
  protected readonly _buffer: PromiseBuffer<Response> = makePromiseBuffer(30);

  /**
   * @inheritDoc
   */
  public sendEvent(event: Event): PromiseLike<Response> {
    return this._buffer.add(() => NATIVE.sendEvent(event));
  }

  /**
   * @inheritDoc
   */
  public close(timeout?: number): PromiseLike<boolean> {
    return this._buffer.drain(timeout);
  }
}
