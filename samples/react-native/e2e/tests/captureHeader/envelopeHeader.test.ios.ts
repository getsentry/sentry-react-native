import { describe, it, beforeAll, expect, afterAll } from '@jest/globals';
import { Envelope } from '@sentry/core';

import {
  createSentryServer,
  containingEventWithMessage,
} from '../../utils/mockedSentryServer';
import { HEADER } from '../../utils/consts';
import { maestro } from '../../utils/maestro';

describe('Capture message', () => {
  let sentryServer = createSentryServer();

  let envelope: Envelope;

  beforeAll(async () => {
    await sentryServer.start();

    const envelopePromise = sentryServer.waitForEnvelope(
      containingEventWithMessage('Captured message'),
    );

    await maestro('tests/captureHeader/envelopeHeader.test.yml');

    envelope = await envelopePromise;
  });

  afterAll(async () => {
    await sentryServer.close();
  });

  it('contains event_id and sent_at in the envelope header', async () => {
    expect(envelope[HEADER]).toEqual(
      expect.objectContaining({
        event_id: expect.any(String),
        sent_at: expect.any(String),
      }),
    );
  });

  it('contains sdk info in the envelope header', async () => {
    expect(envelope[HEADER]).toEqual(
      expect.objectContaining({
        sdk: {
          features: [],
          integrations: [],
          name: 'sentry.javascript.react-native',
          packages: [],
          version: expect.any(String),
        },
        sent_at: expect.any(String),
      }),
    );
  });

  it('contains trace info in the envelope header', async () => {
    expect(envelope[HEADER]).toEqual(
      expect.objectContaining({
        trace: {
          environment: expect.any(String),
          public_key: expect.any(String),
          replay_id: expect.any(String),
          sample_rate: '1',
          sampled: '1',
          trace_id: expect.any(String),
          transaction: 'ErrorsScreen',
        },
      }),
    );
  });
});
