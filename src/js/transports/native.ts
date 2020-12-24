import { Transports } from "@sentry/react";
import { Event, Response, Transport } from "@sentry/types";
import { PromiseBuffer, SentryError } from "@sentry/utils";
import { Platform } from "react-native";

import { NATIVE } from "../wrapper";

/** Native Transport class implementation */
export class NativeTransport implements Transport {
  /** A simple buffer holding all requests. */
  protected readonly _buffer: PromiseBuffer<Response> = new PromiseBuffer(30);

  /** Hack that's used to send transactions on Android */
  private _fetchTransport: Transport;

  constructor(transportOptions: { dsn: string }) {
    this._fetchTransport = new Transports.FetchTransport(transportOptions);
  }

  /**
   * @inheritDoc
   */
  public sendEvent(event: Event): PromiseLike<Response> {
    // This is a hack to send transactions through the JS fetch transport on Android
    // TODO: Remove this hack when android supports transactions through written envelopes.
    if (Platform.OS === "android" && event.type === "transaction") {
      return this._fetchTransport.sendEvent(event);
    }

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
