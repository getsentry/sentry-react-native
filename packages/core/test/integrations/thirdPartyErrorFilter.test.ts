import type { Event } from '@sentry/core';

import { defaultStackParser } from '@sentry/browser';
import { GLOBAL_OBJ, Scope } from '@sentry/core';

import { ReactNativeClient } from '../../src/js/client';
import { thirdPartyErrorFilterIntegration } from '../../src/js/index';

jest.mock('../../src/js/wrapper', () => jest.requireActual('../mockWrapper'));

describe('thirdPartyErrorFilterIntegration', () => {
  beforeEach(() => {
    (GLOBAL_OBJ as { _sentryModuleMetadata?: Record<string, unknown> })._sentryModuleMetadata = {
      [new Error().stack as string]: { '_sentryBundlerPluginAppKey:my-app': true },
    };
  });

  afterEach(() => {
    delete (GLOBAL_OBJ as { _sentryModuleMetadata?: unknown })._sentryModuleMetadata;
  });

  it('keeps errors from application code with the injected module metadata', async () => {
    const beforeSend = await captureError(['my-app']);

    expect(beforeSend).toHaveBeenCalledTimes(1);
  });

  it('drops errors without frames from application code', async () => {
    const beforeSend = await captureError(['other-app']);

    expect(beforeSend).not.toHaveBeenCalled();
  });
});

async function captureError(filterKeys: string[]): Promise<jest.Mock> {
  const beforeSend = jest.fn((event: Event) => event);
  const client = new ReactNativeClient({
    dsn: 'https://public@sentry.example.com/1',
    enableNative: false,
    stackParser: defaultStackParser,
    integrations: [
      thirdPartyErrorFilterIntegration({
        filterKeys,
        behaviour: 'drop-error-if-exclusively-contains-third-party-frames',
      }),
    ],
    transport: () => ({ send: jest.fn().mockResolvedValue({}), flush: jest.fn().mockResolvedValue(true) }),
    beforeSend,
  });
  client.init();

  client.captureException(new Error('test'), undefined, new Scope());
  await client.flush();

  return beforeSend;
}
