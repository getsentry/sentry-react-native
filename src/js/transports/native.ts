import { Event, Response, Transport } from "@sentry/types";
import { PromiseBuffer } from "@sentry/utils";
import { NativeModules } from "react-native";

const { RNSentry } = NativeModules;

/** Native Transport class implementation */
export class NativeTransport implements Transport {
  /** A simple buffer holding all requests. */
  protected readonly _buffer: PromiseBuffer<Response> = new PromiseBuffer(30);

  /**
   * @inheritDoc
   */
  public sendEvent(event: Event): PromiseLike<Response> {
    // tslint:disable-next-line: no-unsafe-any
    return this._buffer.add(RNSentry.sendEvent(event));
  }

  /**
   * @inheritDoc
   */
  public close(timeout?: number): PromiseLike<boolean> {
    return this._buffer.drain(timeout);
  }
}
