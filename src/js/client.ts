import { BaseClient } from "@sentry/core";

import { ReactNativeBackend, ReactNativeOptions } from "./backend";

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
   * If native client is available it will trigger a native crash.
   * Use this only for testing purposes.
   */
  public nativeCrash(): void {
    this._getBackend().nativeCrash();
  }
}
