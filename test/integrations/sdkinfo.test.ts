import { Event, EventHint, Package } from '@sentry/types';

import { SdkInfo } from '../../src/js/integrations';
import { NATIVE } from '../../src/js/wrapper';

let mockedFetchNativeSdkInfo: jest.Mock<PromiseLike<Package | null>, []>;

const mockPackage = {
  name: 'sentry-cocoa',
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

afterEach(() => {
  NATIVE.platform = 'ios';
});

describe('Sdk Info', () => {
  it('Adds native package and javascript platform to event on iOS', async () => {
    mockedFetchNativeSdkInfo = jest.fn().mockResolvedValue(mockPackage);
    const mockEvent: Event = {};
    const processedEvent = await executeIntegrationFor(mockEvent);

    expect(processedEvent?.sdk?.packages).toEqual(expect.arrayContaining([mockPackage]));
    expect(processedEvent?.platform === 'javascript');
    expect(mockedFetchNativeSdkInfo).toBeCalledTimes(1);
  });

  it('Adds javascript platform but not native package on Android', async () => {
    NATIVE.platform = 'android';
    mockedFetchNativeSdkInfo = jest.fn().mockResolvedValue(mockPackage);
    const mockEvent: Event = {};
    const processedEvent = await executeIntegrationFor(mockEvent);

    expect(processedEvent?.sdk?.packages).toEqual(expect.not.arrayContaining([mockPackage]));
    expect(processedEvent?.platform === 'javascript');
    expect(mockedFetchNativeSdkInfo).not.toBeCalled();
  });

  it('Does not add any default non native packages', async () => {
    mockedFetchNativeSdkInfo = jest.fn().mockResolvedValue(null);
    const mockEvent: Event = {};
    const processedEvent = await executeIntegrationFor(mockEvent);

    expect(processedEvent?.sdk?.packages).toEqual([]);
    expect(processedEvent?.platform === 'javascript');
    expect(mockedFetchNativeSdkInfo).toBeCalledTimes(1);
  });
});

function executeIntegrationFor(mockedEvent: Event, mockedHint: EventHint = {}): Promise<Event | null> {
  const integration = new SdkInfo();
  return new Promise((resolve, reject) => {
    integration.setupOnce(async (eventProcessor) => {
      try {
        const processedEvent = await eventProcessor(mockedEvent, mockedHint);
        resolve(processedEvent);
      } catch (e) {
        reject(e);
      }
    });
  });
}
