import { getCurrentHub, Profiler } from '@sentry/react';

import { createIntegration } from '../integrations/factory';
import { ReactNativeTracing } from './reactnativetracing';

/**
 * Custom profiler for the React Native app root.
 */
export class ReactNativeProfiler extends Profiler {
  public readonly name: string = 'ReactNativeProfiler';

  /**
   * Get the app root mount time.
   */
  public componentDidMount(): void {
    super.componentDidMount();
    const hub = getCurrentHub();
    const client = hub.getClient();

    if (!client) {
      // We can't use logger here because this will be logged before the `Sentry.init`.
      // eslint-disable-next-line no-console
      __DEV__ && console.warn('App Start Span could not be finished. `Sentry.wrap` was called before `Sentry.init`.');
      return;
    }

    client.addIntegration && client.addIntegration(createIntegration(this.name));

    const tracingIntegration = hub.getIntegration(ReactNativeTracing);
    tracingIntegration
      && this._mountSpan
      && typeof this._mountSpan.endTimestamp !== 'undefined'
      // The first root component mount is the app start finish.
      && tracingIntegration.onAppStartFinish(this._mountSpan.endTimestamp);
  }
}
