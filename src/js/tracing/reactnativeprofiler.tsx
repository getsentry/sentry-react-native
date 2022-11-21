import { getCurrentHub, Profiler } from '@sentry/react';

import { ReactNativeTracing } from './reactnativetracing';

/**
 * Custom profiler for the React Native app root.
 */
export class ReactNativeProfiler extends Profiler {
  /**
   * Get the app root mount time.
   */
  public componentDidMount(): void {
    super.componentDidMount();

    const tracingIntegration = getCurrentHub().getIntegration(
      ReactNativeTracing
    );

    if (this._mountSpan && tracingIntegration) {
      if (typeof this._mountSpan.endTimestamp !== 'undefined') {
        // The first root component mount is the app start finish.
        tracingIntegration.onAppStartFinish(this._mountSpan.endTimestamp);
      }
    }
  }
}
