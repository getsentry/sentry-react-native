import { spanToJSON } from '@sentry/core';
import { getClient, Profiler } from '@sentry/react';

import { createIntegration } from '../integrations/factory';
import type { ReactNativeTracing } from './reactnativetracing';

const ReactNativeProfilerGlobalState = {
  appStartReported: false,
};

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
    if (!ReactNativeProfilerGlobalState.appStartReported) {
      this._reportAppStart();
      ReactNativeProfilerGlobalState.appStartReported = true;
    }
  }

  /**
   * Notifies the Tracing integration that the app start has finished.
   */
  private _reportAppStart(): void {
    const client = getClient();

    if (!client) {
      // We can't use logger here because this will be logged before the `Sentry.init`.
      // eslint-disable-next-line no-console
      __DEV__ && console.warn('App Start Span could not be finished. `Sentry.wrap` was called before `Sentry.init`.');
      return;
    }

    client.addIntegration && client.addIntegration(createIntegration(this.name));

    const endTimestamp = this._mountSpan && typeof spanToJSON(this._mountSpan).timestamp
    const tracingIntegration = client.getIntegrationByName && client.getIntegrationByName<ReactNativeTracing>('ReactNativeTracing');
    tracingIntegration
      && typeof endTimestamp === 'number'
      // The first root component mount is the app start finish.
      && tracingIntegration.onAppStartFinish(endTimestamp);
  }
}
