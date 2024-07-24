import type { Envelope } from '@sentry/types';

import { NativeTransport } from '../../src/js/transports/native';

jest.mock('../../src/js/wrapper', () => ({
  NATIVE: {
    sendEnvelope: jest.fn(() => Promise.resolve({ status: 200 })),
  },
}));

describe('NativeTransport', () => {
  test('call native sendEvent', async () => {
    const transport = new NativeTransport();
    await expect(transport.send({} as Envelope)).resolves.toEqual({ status: 200 });
  });
});
