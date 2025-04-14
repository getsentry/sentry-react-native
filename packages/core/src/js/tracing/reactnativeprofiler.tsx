import { logger, timestampInSeconds } from '@sentry/core';
import { getClient, Profiler } from '@sentry/react';

import { getAppRegistryIntegration } from '../integrations/appRegistry';
import { createIntegration } from '../integrations/factory';
import { _captureAppStart, _setRootComponentCreationTimestampMs } from '../tracing/integrations/appStart';

const ReactNativeProfilerGlobalState = {
  appStartReported: false,
  onRunApplicationHook: () => {
    ReactNativeProfilerGlobalState.appStartReported = false;
  },
};

/**
 * Custom profiler for the React Native app root.
 */
export class ReactNativeProfiler extends Profiler {
  public readonly name: string = 'ReactNativeProfiler';

  public constructor(props: ConstructorParameters<typeof Profiler>[0]) {
    _setRootComponentCreationTimestampMs(timestampInSeconds() * 1000);
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
    const client = getClient();

    if (!client) {
      // We can't use logger here because this will be logged before the `Sentry.init`.
      // eslint-disable-next-line no-console
      __DEV__ && console.warn('App Start Span could not be finished. `Sentry.wrap` was called before `Sentry.init`.');
      return;
    }

    client.addIntegration && client.addIntegration(createIntegration(this.name));

    const appRegistryIntegration = getAppRegistryIntegration(client);
    if (appRegistryIntegration && typeof appRegistryIntegration.onRunApplication === 'function') {
      appRegistryIntegration.onRunApplication(ReactNativeProfilerGlobalState.onRunApplicationHook);
    } else {
      logger.warn('AppRegistryIntegration.onRunApplication not found or invalid.');
    }

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    _captureAppStart({ isManual: false });
  }
}
