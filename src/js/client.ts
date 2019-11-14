import { BaseClient, Scope } from "@sentry/core";
import { Event, EventHint } from "@sentry/types";

import { ReactNativeBackend, ReactNativeOptions } from "./backend";
import { SDK_NAME, SDK_VERSION } from "./version";

/**
 * The Sentry React Native SDK Client.
 *
 * @see ReactNativeOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
export class ReactNativeClient extends BaseClient<
  ReactNativeBackend,
  ReactNativeOptions
> {
  /**
   * Creates a new React Native SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: ReactNativeOptions) {
    super(ReactNativeBackend, options);
  }

  /**
   * @inheritDoc
   */
  protected _prepareEvent(
    event: Event,
    scope?: Scope,
    hint?: EventHint
  ): PromiseLike<Event | null> {
    event.platform = event.platform || "javascript";
    event.sdk = {
      ...event.sdk,
      name: SDK_NAME,
      packages: [
        ...((event.sdk && event.sdk.packages) || []),
        {
          name: "npm:@sentry/react-native",
          version: SDK_VERSION
        }
      ],
      version: SDK_VERSION
    };

    return super._prepareEvent(event, scope, hint);
  }

  /**
   * If native client is available it will trigger a native crash.
   * Use this only for testing purposes.
   */
  public nativeCrash(): void {
    this._getBackend().nativeCrash();
  }
}
