import { timestampInSeconds } from '@sentry/core';
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

type ProfilerConstructorProps = ConstructorParameters<typeof Profiler>[0];
type ReactNativeProfilerConstructorProps = ProfilerConstructorProps &
{
  /**
   * Since we cannot modify the Profiler class directly, this flag is used to preserve its original behavior.
   * When true, it indicates that `updateProps` were not passed in the options, signaling the code to remove `updateProps` from the parameters.
   * Otherwise, it means `updateProps` were provided for use with the React Native profiler.
   */
  removeUpdateProps?: boolean
};

/**
 * Custom profiler for the React Native app root.
 */
export class ReactNativeProfiler extends Profiler {
  public readonly name: string = 'ReactNativeProfiler';

  public constructor(props: ReactNativeProfilerConstructorProps) {
    _setRootComponentCreationTimestampMs(timestampInSeconds() * 1000);
    if (props.removeUpdateProps === true) {
      delete props.updateProps;
    }
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

    client.addIntegration?.(createIntegration(this.name));

    getAppRegistryIntegration(client).onRunApplication(ReactNativeProfilerGlobalState.onRunApplicationHook);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    _captureAppStart({ isManual: false });
  }
}
