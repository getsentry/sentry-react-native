import { NativeTransport } from '../../src/js/transports/native';

jest.mock('../../src/js/wrapper', () => ({
  NATIVE: {
    sendEvent: jest.fn(() => Promise.resolve({ status: 200 })),
  },
}));

describe('NativeTransport', () => {
  test('call native sendEvent', async () => {
    // TODO: Remove this when we remove the fetch transport hack inside the native transport
    const transport = new NativeTransport({
      dsn:
        'https://6890c2f6677340daa4804f8194804ea2@o19635.ingest.sentry.io/148053',
    });
    await expect(transport.sendEvent({})).resolves.toEqual({ status: 200 });
  });
});
