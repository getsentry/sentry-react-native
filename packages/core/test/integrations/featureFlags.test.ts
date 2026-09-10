import type { FeatureFlagsIntegration } from '@sentry/core';

import { getCurrentScope } from '@sentry/core';

import { featureFlagsIntegration } from '../../src/js/integrations/featureFlags';
import { NATIVE } from '../../src/js/wrapper';

jest.mock('../../src/js/wrapper');

describe('Feature Flags Integration', () => {
  let integration: FeatureFlagsIntegration;

  beforeEach(() => {
    integration = featureFlagsIntegration();
    getCurrentScope().clear();
  });

  afterEach(() => {
    jest.clearAllMocks();
    getCurrentScope().clear();
  });

  it('registers under the shared FeatureFlags name', () => {
    expect(integration.name).toBe('FeatureFlags');
  });

  it('forwards boolean true to the native SDK', () => {
    integration.addFeatureFlag('my-flag', true);
    expect(NATIVE.addFeatureFlag).toHaveBeenCalledWith('my-flag', true);
    expect(NATIVE.addFeatureFlag).toHaveBeenCalledOnce();
  });

  it('forwards boolean false to the native SDK', () => {
    integration.addFeatureFlag('my-flag', false);
    expect(NATIVE.addFeatureFlag).toHaveBeenCalledWith('my-flag', false);
    expect(NATIVE.addFeatureFlag).toHaveBeenCalledOnce();
  });

  it('keeps buffering the flag on the JavaScript scope', () => {
    integration.addFeatureFlag('my-flag', true);
    expect(getCurrentScope().getScopeData().contexts.flags).toEqual({
      values: [{ flag: 'my-flag', result: true }],
    });
  });

  it('does not forward non-boolean values to the native SDK', () => {
    integration.addFeatureFlag('string-flag', 'enabled');
    integration.addFeatureFlag('number-flag', 42);
    integration.addFeatureFlag('object-flag', { enabled: true });
    expect(NATIVE.addFeatureFlag).not.toHaveBeenCalled();
  });

  it('does not throw and still buffers on the JS scope when native forwarding fails', () => {
    (NATIVE.addFeatureFlag as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Native module is not available');
    });

    expect(() => integration.addFeatureFlag('my-flag', true)).not.toThrow();
    expect(getCurrentScope().getScopeData().contexts.flags).toEqual({
      values: [{ flag: 'my-flag', result: true }],
    });
  });
});
