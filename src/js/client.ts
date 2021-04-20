import { BaseClient } from "@sentry/core";

import { ReactNativeBackend } from "./backend";
import { ReactNativeOptions } from "./options";
import { NATIVE } from "./wrapper";

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

  /**
   * @inheritDoc
   */
  public close(): PromiseLike<boolean> {
    return super.close().then((result: boolean) => {
      return NATIVE.closeNativeSdk().then(() => result) as PromiseLike<boolean>;
    });
  }
}
