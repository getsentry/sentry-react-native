import type { HttpRequestEventMap } from '@mswjs/interceptors';
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest';
import type { Envelope, Hub } from '@sentry/types';
import { XMLHttpRequest } from 'xmlhttprequest';

import { Spotlight } from '../../src/js/integrations/spotlight';

globalThis.XMLHttpRequest = XMLHttpRequest;
const requestListener = jest.fn<void, HttpRequestEventMap['request']>();
const interceptor = new XMLHttpRequestInterceptor();
interceptor.on('request', requestListener);

describe('spotlight', () => {
  beforeAll(async () => {
    interceptor.apply();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

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

  it('should remove image attachments from spotlight envelope', async () => {
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

    const [{ request }] = requestListener.mock.calls[0];
    expect(spotlightBeforeEnvelope).toBeDefined();
    expect((await request.text()).includes('image/png')).toBe(false);
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
