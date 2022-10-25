import { Event, EventHint } from '@sentry/types';

import { ReactNativeError } from '../../src/js/integrations/debugsymbolicator';
import { ReactNativeContext, ReactNativeInfo } from '../../src/js/integrations/reactnativeinfo';

let mockedIsHermesEnabled: jest.Mock<boolean, []>;
let mockedIsTurboModuleEnabled: jest.Mock<boolean, []>;
let mockedIsFabricEnabled: jest.Mock<boolean, []>;

jest.mock('../../src/js/utils/environment', () => ({
  isHermesEnabled: () => mockedIsHermesEnabled(),
  isTurboModuleEnabled: () => mockedIsTurboModuleEnabled(),
  isFabricEnabled: () => mockedIsFabricEnabled(),
}));

describe('React Native Info', () => {
  beforeEach(() => {
    mockedIsHermesEnabled = jest.fn().mockReturnValue(false);
    mockedIsTurboModuleEnabled = jest.fn().mockReturnValue(false);
    mockedIsFabricEnabled = jest.fn().mockReturnValue(false);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('does not pollute event with undefined fields', async () => {
    const mockEvent: Event = {
      message: 'test'
    };
    const mockedHint: EventHint = {};
    const actualEvent = await executeIntegrationFor(mockEvent, mockedHint);

    expectMocksToBeCalledOnce();
    expect(actualEvent).toEqual(<Event>{
      message: 'test',
      contexts: {
        react_native: <ReactNativeContext>{
          type: 'runtime',
          name: 'react-native',
          turbo_module: false,
          fabric: false,
        },
      },
    });
  });

  it('adds hermes tag and js_engine to context if hermes enabled', async () => {
    mockedIsHermesEnabled = jest.fn().mockReturnValue(true);
    const actualEvent = await executeIntegrationFor({}, {});

    expectMocksToBeCalledOnce();
    expect(actualEvent?.tags?.hermes).toEqual('true');
    expect(
      (actualEvent?.contexts?.react_native as ReactNativeContext | undefined)?.js_engine,
    ).toEqual('hermes');
  });

  it('does not override existing hermes tag', async () => {
    mockedIsHermesEnabled = jest.fn().mockReturnValue(true);
    const mockedEvent: Event = {
      tags: {
        hermes: 'test_hermes_tag',
      },
    };
    const actualEvent = await executeIntegrationFor(mockedEvent, {});

    expectMocksToBeCalledOnce();
    expect(actualEvent?.tags?.hermes).toEqual('test_hermes_tag');
  });

  it('adds engine from rn error', async () => {
    const mockedHint: EventHint = {
      originalException: <ReactNativeError>{
        jsEngine: 'test_engine',
      },
    };
    const actualEvent = await executeIntegrationFor({}, mockedHint);

    expectMocksToBeCalledOnce();
    expect(actualEvent?.tags?.hermes).toEqual(undefined);
    expect(
      (actualEvent?.contexts?.react_native as ReactNativeContext | undefined)?.js_engine,
    ).toEqual('test_engine');
  });

  it('adds component stack', async () => {
    const mockedHint: EventHint = {
      originalException: <ReactNativeError>{
        componentStack: 'test_stack',
      },
    };
    const actualEvent = await executeIntegrationFor({}, mockedHint);

    expectMocksToBeCalledOnce();
    expect(
      (actualEvent?.contexts?.react_native as ReactNativeContext | undefined)?.component_stack,
    ).toEqual('test_stack');
  });

  it('marks turbo modules enabled', async () => {
    mockedIsTurboModuleEnabled = jest.fn().mockReturnValue(true);
    const actualEvent = await executeIntegrationFor({}, {});

    expectMocksToBeCalledOnce();
    expect(
      (actualEvent?.contexts?.react_native as ReactNativeContext | undefined)?.turbo_module,
    ).toEqual(true);
  });

  it('marks fabric enabled', async () => {
    mockedIsFabricEnabled = jest.fn().mockReturnValue(true);
    const actualEvent = await executeIntegrationFor({}, {});

    expectMocksToBeCalledOnce();
    expect(
      (actualEvent?.contexts?.react_native as ReactNativeContext | undefined)?.fabric,
    ).toEqual(true);
  });

  it('does not override existing react_native', async () => {
    const mockedEvent: Event = {
      contexts: {
        react_native: {
          test: 'context',
        },
      },
    };
    const actualEvent = await executeIntegrationFor(mockedEvent, {});

    expectMocksToBeCalledOnce();
    expect(actualEvent?.contexts?.react_native).toEqual({
      test: 'context',
    });
  });
});

function expectMocksToBeCalledOnce() {
  expect(mockedIsHermesEnabled).toBeCalledTimes(1);
  expect(mockedIsTurboModuleEnabled).toBeCalledTimes(1);
  expect(mockedIsFabricEnabled).toBeCalledTimes(1);
}

function executeIntegrationFor(mockedEvent: Event, mockedHint: EventHint): Promise<Event | null> {
  const integration = new ReactNativeInfo();
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
