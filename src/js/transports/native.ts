import { BaseTransportOptions, Envelope, Transport } from '@sentry/types';
import { makePromiseBuffer, PromiseBuffer } from '@sentry/utils';

import { NATIVE } from '../wrapper';

export const DEFAULT_BUFFER_SIZE = 30;

export type BaseNativeTransport = BaseTransportOptions

export interface BaseNativeTransportOptions {
  bufferSize?: number;
}

/** Native Transport class implementation */
export class NativeTransport implements Transport {
  /** A simple buffer holding all requests. */
  protected readonly _buffer: PromiseBuffer<void>;

  public constructor(options: BaseNativeTransportOptions = {}) {
    this._buffer = makePromiseBuffer(options.bufferSize || DEFAULT_BUFFER_SIZE);
  }

  /**
   * Sends the envelope to the Store endpoint in Sentry.
   *
   * @param envelope Envelope that should be sent to Sentry.
   */
  public send(envelope: Envelope): PromiseLike<void> {
    return this._buffer.add(() => NATIVE.sendEnvelope(envelope));
  }

  /**
   * Wait for all envelopes to be sent or the timeout to expire, whichever comes first.
   *
   * @param timeout Maximum time in ms the transport should wait for envelopes to be flushed. Omitting this parameter will
   *   cause the transport to wait until all events are sent before resolving the promise.
   * @returns A promise that will resolve with `true` if all events are sent before the timeout, or `false` if there are
   * still events in the queue when the timeout is reached.
   */
  public flush(timeout?: number): PromiseLike<boolean> {
    return this._buffer.drain(timeout);
  }
}

/**
 * Creates a Native Transport.
 */
export function makeReactNativeTransport(options: BaseNativeTransportOptions = {}): NativeTransport {
  return new NativeTransport(options);
}
