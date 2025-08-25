import type { Client, Event, EventHint, Package } from '@sentry/core';

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

  it('Add none setting when defaultIp is undefined', async () => {
    mockedFetchNativeSdkInfo = jest.fn().mockResolvedValue(null);
    const mockEvent: Event = {};
    const processedEvent = await processEvent(mockEvent, {}, undefined);

    expect(processedEvent?.sdk?.name).toEqual(SDK_NAME);
    expect(processedEvent?.sdk?.version).toEqual(SDK_VERSION);
    // @ts-expect-error injected type.
    expect(processedEvent?.sdk?.settings?.infer_ip).toEqual('never');
  });

  it('Add none setting when defaultIp is false', async () => {
    mockedFetchNativeSdkInfo = jest.fn().mockResolvedValue(null);
    const mockEvent: Event = {};
    const processedEvent = await processEvent(mockEvent, {}, false);

    expect(processedEvent?.sdk?.name).toEqual(SDK_NAME);
    expect(processedEvent?.sdk?.version).toEqual(SDK_VERSION);
    // @ts-expect-error injected type.
    expect(processedEvent?.sdk?.settings?.infer_ip).toEqual('never');
  });

  it('Add auto setting when defaultIp is true', async () => {
    mockedFetchNativeSdkInfo = jest.fn().mockResolvedValue(null);
    const mockEvent: Event = {};
    const processedEvent = await processEvent(mockEvent, {}, true);

    expect(processedEvent?.sdk?.name).toEqual(SDK_NAME);
    expect(processedEvent?.sdk?.version).toEqual(SDK_VERSION);
    // @ts-expect-error injected type.
    expect(processedEvent?.sdk?.settings?.infer_ip).toEqual('auto');
  });

  it('removes ip_address if it is "{{auto}}"', () => {
    const mockHandler = jest.fn();

    const client = {
      getOptions: () => ({ sendDefaultPii: true }),
      on: (eventName: string, cb: (event: any) => void) => {
        if (eventName === 'beforeSendEvent') {
          mockHandler.mockImplementation(cb);
        }
      },
    };

    sdkInfoIntegration().setup!(client as any);

    const testEvent = { user: { ip_address: '{{auto}}' } };
    mockHandler(testEvent);

    expect(testEvent.user.ip_address).toBeUndefined();
  });

  it('keeps ip_address if it is not "{{auto}}"', () => {
    const mockHandler = jest.fn();

    const client = {
      getOptions: () => ({ sendDefaultPii: true }),
      on: (eventName: string, cb: (event: any) => void) => {
        if (eventName === 'beforeSendEvent') {
          mockHandler.mockImplementation(cb);
        }
      },
    };

    sdkInfoIntegration().setup!(client as any);

    const testEvent = { user: { ip_address: '1.2.3.4' } };
    mockHandler(testEvent);

    expect(testEvent.user.ip_address).toBe('1.2.3.4');
  });
});

function processEvent(
  mockedEvent: Event,
  mockedHint: EventHint = {},
  sendDefaultPii?: boolean,
): Event | null | PromiseLike<Event | null> {
  const integration = sdkInfoIntegration();
  if (sendDefaultPii != null) {
    const mockClient: jest.Mocked<Client> = {
      getOptions: jest.fn().mockReturnValue({ sendDefaultPii: sendDefaultPii }),
      on: jest.fn(),
    } as any;
    integration.setup!(mockClient);
  }
  return integration.processEvent!(mockedEvent, mockedHint, {} as any);
}
