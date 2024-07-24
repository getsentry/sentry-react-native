import type { Event, EventHint, Package } from '@sentry/types';

import { SDK_NAME, SDK_VERSION } from '../../src/js';
import { sdkInfoIntegration } from '../../src/js/integrations/sdkinfo';
import { NATIVE } from '../../src/js/wrapper';

let mockedFetchNativeSdkInfo: jest.Mock<PromiseLike<Package | null>, []>;

const mockCocoaPackage = {
  name: 'sentry-cocoa',
  version: '0.0.1',
};

const mockAndroidPackage = {
  name: 'sentry-android',
  version: '0.0.1',
};

jest.mock('../../src/js/wrapper', () => {
  const actual = jest.requireActual('../../src/js/wrapper');

  return {
    NATIVE: {
      ...actual.NATIVE,
      platform: 'ios',
      fetchNativeSdkInfo: () => mockedFetchNativeSdkInfo(),
    },
  };
});

describe('Sdk Info', () => {
  afterEach(() => {
    NATIVE.platform = 'ios';
  });

  it('Adds native package and javascript platform to event on iOS', async () => {
    mockedFetchNativeSdkInfo = jest.fn().mockResolvedValue(mockCocoaPackage);
    const mockEvent: Event = {};
    const processedEvent = await processEvent(mockEvent);

    expect(processedEvent?.sdk?.packages).toEqual(expect.arrayContaining([mockCocoaPackage]));
    expect(processedEvent?.platform === 'javascript');
    expect(mockedFetchNativeSdkInfo).toBeCalledTimes(1);
  });

  it('Adds native package and javascript platform to event on Android', async () => {
    NATIVE.platform = 'android';
    mockedFetchNativeSdkInfo = jest.fn().mockResolvedValue(mockAndroidPackage);
    const mockEvent: Event = {};
    const processedEvent = await processEvent(mockEvent);

    expect(processedEvent?.sdk?.packages).toEqual(expect.not.arrayContaining([mockCocoaPackage]));
    expect(processedEvent?.platform === 'javascript');
    expect(mockedFetchNativeSdkInfo).toBeCalledTimes(1);
  });

  it('Does not add any default non native packages', async () => {
    mockedFetchNativeSdkInfo = jest.fn().mockResolvedValue(null);
    const mockEvent: Event = {};
    const processedEvent = await processEvent(mockEvent);

    expect(processedEvent?.sdk?.packages).toEqual([]);
    expect(processedEvent?.platform === 'javascript');
    expect(mockedFetchNativeSdkInfo).toBeCalledTimes(1);
  });

  it('Does not overwrite existing sdk name and version', async () => {
    mockedFetchNativeSdkInfo = jest.fn().mockResolvedValue(null);
    const mockEvent: Event = {
      sdk: {
        name: 'test-sdk',
        version: '1.0.0',
      },
    };
    const processedEvent = await processEvent(mockEvent);

    expect(processedEvent?.sdk?.name).toEqual('test-sdk');
    expect(processedEvent?.sdk?.version).toEqual('1.0.0');
  });

  it('Does use default sdk name and version', async () => {
    mockedFetchNativeSdkInfo = jest.fn().mockResolvedValue(null);
    const mockEvent: Event = {};
    const processedEvent = await processEvent(mockEvent);

    expect(processedEvent?.sdk?.name).toEqual(SDK_NAME);
    expect(processedEvent?.sdk?.version).toEqual(SDK_VERSION);
  });
});

function processEvent(mockedEvent: Event, mockedHint: EventHint = {}): Event | null | PromiseLike<Event | null> {
  const integration = sdkInfoIntegration();
  return integration.processEvent!(mockedEvent, mockedHint, {} as any);
}
