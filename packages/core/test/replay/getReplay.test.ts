import type { Client } from '@sentry/core';

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import * as SentryCore from '@sentry/core';

import type { Replay } from '../../src/js/replay/replayInterface';

import { getReplay } from '../../src/js/replay/getReplay';

describe('getReplay', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const mockClient = (integrations: Record<string, Replay>): jest.Mocked<Pick<Client, 'getIntegrationByName'>> => ({
    getIntegrationByName: jest.fn(name => integrations[name]) as jest.Mocked<Client['getIntegrationByName']>,
  });

  const asReplay = (name: string): Replay => ({ name }) as unknown as Replay;

  it('returns undefined when there is no active client', () => {
    jest.spyOn(SentryCore, 'getClient').mockReturnValue(undefined);
    expect(getReplay()).toBeUndefined();
  });

  it('returns the mobile replay integration when present', () => {
    const mobile = asReplay('MobileReplay');
    jest.spyOn(SentryCore, 'getClient').mockReturnValue(mockClient({ MobileReplay: mobile }) as unknown as Client);

    expect(getReplay()).toBe(mobile);
  });

  it('falls back to the browser replay integration when mobile is absent', () => {
    const browser = asReplay('Replay');
    jest.spyOn(SentryCore, 'getClient').mockReturnValue(mockClient({ Replay: browser }) as unknown as Client);

    expect(getReplay()).toBe(browser);
  });

  it('prefers the mobile replay integration over the browser one', () => {
    const mobile = asReplay('MobileReplay');
    const browser = asReplay('Replay');
    jest
      .spyOn(SentryCore, 'getClient')
      .mockReturnValue(mockClient({ MobileReplay: mobile, Replay: browser }) as unknown as Client);

    expect(getReplay()).toBe(mobile);
  });

  it('returns undefined when no replay integration is installed', () => {
    jest.spyOn(SentryCore, 'getClient').mockReturnValue(mockClient({}) as unknown as Client);
    expect(getReplay()).toBeUndefined();
  });
});
