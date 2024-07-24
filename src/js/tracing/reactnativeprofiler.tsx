import { getClient, getCurrentHub, Profiler } from '@sentry/react';
import { timestampInSeconds } from '@sentry/utils';

import { createIntegration } from '../integrations/factory';
import { ReactNativeTracing } from './reactnativetracing';

const ReactNativeProfilerGlobalState = {
  appStartReported: false,
};

/**
 * Custom profiler for the React Native app root.
 */
export class ReactNativeProfiler extends Profiler {
  public readonly name: string = 'ReactNativeProfiler';

  public constructor(props: ConstructorParameters<typeof Profiler>[0]) {
    const client = getClient();
    const integration = client && client.getIntegrationByName && client.getIntegrationByName<ReactNativeTracing>('ReactNativeTracing');
    integration && integration.setRootComponentFirstConstructorCallTimestampMs(timestampInSeconds() * 1000);
    super(props);
  }

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
