import { featureFlagsIntegration as jsFeatureFlagsIntegration, type FeatureFlagsIntegration } from '@sentry/browser';

import { NATIVE } from '../wrapper';

/**
 * Sentry integration for buffering feature flag evaluations and capturing them
 * on error events and spans.
 *
 * On top of the JavaScript `featureFlagsIntegration` — which attaches flags to
 * events and spans captured on the JavaScript layer — this React Native variant
 * forwards every boolean flag evaluation to the native SDKs. This way flags are
 * also attached to native crashes and native error events.
 *
 * See the [feature flag documentation](https://develop.sentry.dev/sdk/expected-features/#feature-flags) for more information.
 *
 * @example
 * ```
 * import * as Sentry from '@sentry/react-native';
 * import { type FeatureFlagsIntegration } from '@sentry/react-native';
 *
 * // Setup
 * Sentry.init({ integrations: [Sentry.featureFlagsIntegration()] });
 *
 * // Verify
 * const flagsIntegration = Sentry.getClient()?.getIntegrationByName<FeatureFlagsIntegration>('FeatureFlags');
 * if (flagsIntegration) {
 *   flagsIntegration.addFeatureFlag('my-flag', true);
 * } else {
 *   // check your setup
 * }
 * Sentry.captureException(new Error('broke')); // 'my-flag' should be captured to this Sentry event.
 * ```
 */
export const featureFlagsIntegration = (): FeatureFlagsIntegration => {
  const integration = jsFeatureFlagsIntegration();
  const addFeatureFlagToJs = integration.addFeatureFlag.bind(integration);

  return {
    ...integration,
    addFeatureFlag(name: string, value: unknown): void {
      addFeatureFlagToJs(name, value);
      // The native feature flag APIs only accept boolean values, matching the
      // JavaScript flag buffer which ignores non-boolean evaluations.
      if (typeof value === 'boolean') {
        NATIVE.addFeatureFlag(name, value);
      }
    },
  };
};
