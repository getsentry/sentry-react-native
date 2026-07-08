import { captureException, getClient, setCurrentClient } from '@sentry/core';

import { registerFeatureMarker } from '../../src/js/utils/featureMarkers';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

describe('registerFeatureMarker', () => {
  beforeEach(() => {
    setCurrentClient(new TestClient(getDefaultTestClientOptions()));
    getClient()?.init();
  });

  test('registers a no-op named integration on the current client', () => {
    expect(getClient()?.getIntegrationByName('SomeFeature')).toBeUndefined();

    registerFeatureMarker('SomeFeature');

    expect(getClient()?.getIntegrationByName('SomeFeature')).toEqual({ name: 'SomeFeature' });
  });

  test('is idempotent — second call with the same name does not overwrite', () => {
    const first = { name: 'IdempotentFeature', setupOnce: jest.fn() };
    getClient()?.addIntegration(first);

    registerFeatureMarker('IdempotentFeature');

    expect(getClient()?.getIntegrationByName('IdempotentFeature')).toBe(first);
  });

  test('is a no-op when no client is available', () => {
    setCurrentClient(undefined as unknown as TestClient);

    expect(() => registerFeatureMarker('NoClientFeature')).not.toThrow();
  });

  test('accepts an explicit client argument', () => {
    const explicitClient = new TestClient(getDefaultTestClientOptions());
    explicitClient.init();

    registerFeatureMarker('ExplicitClientFeature', explicitClient);

    expect(explicitClient.getIntegrationByName('ExplicitClientFeature')).toEqual({ name: 'ExplicitClientFeature' });
    expect(getClient()?.getIntegrationByName('ExplicitClientFeature')).toBeUndefined();
  });

  test('the marker name is attached to `event.sdk.integrations` on captured events', async () => {
    registerFeatureMarker('AdoptionSignal');

    captureException(new Error('boom'));
    await getClient()?.flush();

    const client = getClient() as TestClient;
    const event = client.eventQueue[0];
    expect(event?.sdk?.integrations).toContain('AdoptionSignal');
  });
});
