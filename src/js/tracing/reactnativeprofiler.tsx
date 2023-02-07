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
    getCurrentHub().getClient()?.addIntegration?.(createIntegration(this.name));

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
