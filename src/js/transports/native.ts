import { BaseTransportOptions, Envelope, Transport } from '@sentry/types';
import { makePromiseBuffer, PromiseBuffer } from '@sentry/utils';

import { NATIVE } from '../wrapper';

export interface BaseNativeTransport extends BaseTransportOptions { }

/** Native Transport class implementation */
export class NativeTransport implements Transport {
  /** A simple buffer holding all requests. */
  protected readonly _buffer: PromiseBuffer<void> = makePromiseBuffer(30);

  /**
   * @inheritDoc
   */
  send(request: Envelope): PromiseLike<void> {
    return this._buffer.add(() => NATIVE.sendEnvelope(request));
  }

  /**
   * @inheritDoc
   */
  flush(timeout?: number): PromiseLike<boolean> {
    return this._buffer.drain(timeout);
  }
}

export function makeReactNativeTransport() { return new NativeTransport(); }
