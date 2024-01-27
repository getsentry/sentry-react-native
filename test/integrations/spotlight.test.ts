import type { Envelope, Hub } from '@sentry/types';
import fetchMock from 'jest-fetch-mock';

import { Spotlight } from '../../src/js/integrations/spotlight';

describe('spotlight', () => {
  it('should not change the original envelope', () => {
    const mockHub = createMockHub();

    const spotlight = Spotlight();
    spotlight.setupOnce(
      () => {},
      () => mockHub as unknown as Hub,
    );

    const spotlightBeforeEnvelope = mockHub.getClient().on.mock.calls[0]?.[1] as
      | ((envelope: Envelope) => void)
      | undefined;

    const originalEnvelopeReference = createMockEnvelope();
    spotlightBeforeEnvelope?.(originalEnvelopeReference);

    expect(spotlightBeforeEnvelope).toBeDefined();
    expect(originalEnvelopeReference).toEqual(createMockEnvelope());
  });

  it('should remove image attachments from spotlight envelope', () => {
    fetchMock.mockOnce();
    const mockHub = createMockHub();

    const spotlight = Spotlight();
    spotlight.setupOnce(
      () => {},
      () => mockHub as unknown as Hub,
    );

    const spotlightBeforeEnvelope = mockHub.getClient().on.mock.calls[0]?.[1] as
      | ((envelope: Envelope) => void)
      | undefined;

    spotlightBeforeEnvelope?.(createMockEnvelope());

    expect(spotlightBeforeEnvelope).toBeDefined();
    expect(fetchMock.mock.lastCall?.[1]?.body?.toString().includes('image/png')).toBe(false);
  });
});

function createMockHub() {
  const client = {
    on: jest.fn(),
  };

  return {
    getClient: jest.fn().mockReturnValue(client),
  };
}

function createMockEnvelope(): Envelope {
  return [
    {
      event_id: 'event_id',
      sent_at: 'sent_at',
      sdk: {
        name: 'sdk_name',
        version: 'sdk_version',
      },
    },
    [
      [
        {
          type: 'event',
          length: 0,
        },
        {
          event_id: 'event_id',
        },
      ],
      [
        {
          type: 'attachment',
          length: 10,
          filename: 'filename',
        },
        'attachment',
      ],
      [
        {
          type: 'attachment',
          length: 8,
          filename: 'filename2',
          content_type: 'image/png',
        },
        Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG header
      ],
    ],
  ];
}
