import type { Client, Event, EventHint } from '@sentry/types';

import type { ReactNativeError } from '../../src/js/integrations/debugsymbolicator';
import type { ReactNativeContext } from '../../src/js/integrations/reactnativeinfo';
import { reactNativeInfoIntegration } from '../../src/js/integrations/reactnativeinfo';

let mockedIsHermesEnabled: jest.Mock<boolean, []>;
let mockedIsTurboModuleEnabled: jest.Mock<boolean, []>;
let mockedIsFabricEnabled: jest.Mock<boolean, []>;
let mockedGetReactNativeVersion: jest.Mock<string, []>;
let mockedGetHermesVersion: jest.Mock<string | undefined, []>;
let mockedIsExpo: jest.Mock<boolean, []>;
let mockedGetExpoGoVersion: jest.Mock<string | undefined, []>;
let mockedGetExpoSdkVersion: jest.Mock<string | undefined, []>;

jest.mock('../../src/js/utils/environment', () => ({
  isHermesEnabled: () => mockedIsHermesEnabled(),
  isTurboModuleEnabled: () => mockedIsTurboModuleEnabled(),
  isFabricEnabled: () => mockedIsFabricEnabled(),
  getReactNativeVersion: () => mockedGetReactNativeVersion(),
  getHermesVersion: () => mockedGetHermesVersion(),
  isExpo: () => mockedIsExpo(),
  getExpoGoVersion: () => mockedGetExpoGoVersion(),
  getExpoSdkVersion: () => mockedGetExpoSdkVersion(),
}));

describe('React Native Info', () => {
  beforeEach(() => {
    mockedIsHermesEnabled = jest.fn().mockReturnValue(true);
    mockedIsTurboModuleEnabled = jest.fn().mockReturnValue(false);
    mockedIsFabricEnabled = jest.fn().mockReturnValue(false);
    mockedGetReactNativeVersion = jest.fn().mockReturnValue('1000.0.0-test');
    mockedGetHermesVersion = jest.fn().mockReturnValue(undefined);
    mockedIsExpo = jest.fn().mockReturnValue(false);
    mockedGetExpoGoVersion = jest.fn().mockReturnValue(undefined);
    mockedGetExpoSdkVersion = jest.fn().mockReturnValue(undefined);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('does not pollute event with undefined fields', async () => {
    const mockEvent: Event = {
      message: 'test',
    };
    const mockedHint: EventHint = {};
    const actualEvent = await executeIntegrationFor(mockEvent, mockedHint);

    expectMocksToBeCalledOnce();
    expect(actualEvent).toStrictEqual(<Event>{
      message: 'test',
      contexts: {
        react_native_context: <ReactNativeContext>{
          turbo_module: false,
          fabric: false,
          js_engine: 'hermes',
          hermes_debug_info: true,
          react_native_version: '1000.0.0-test',
          expo: false,
        },
      },
      tags: {
        hermes: 'true',
      },
    });
  });

  it('adds hermes tag and js_engine to context if hermes enabled', async () => {
    mockedIsHermesEnabled = jest.fn().mockReturnValue(true);
    mockedGetHermesVersion = jest.fn().mockReturnValue('for RN 999.0.0');
    const actualEvent = await executeIntegrationFor({}, {});

    expectMocksToBeCalledOnce();
    expect(actualEvent?.tags?.hermes).toEqual('true');
    expect(actualEvent?.contexts?.react_native_context).toEqual(
      expect.objectContaining({
        js_engine: 'hermes',
        hermes_version: 'for RN 999.0.0',
      }),
    );
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
    mockedIsHermesEnabled = jest.fn().mockReturnValue(false);
    const mockedHint: EventHint = {
      originalException: <ReactNativeError>{
        jsEngine: 'test_engine',
      },
    };
    const actualEvent = await executeIntegrationFor({}, mockedHint);

    expectMocksToBeCalledOnce();
    expect(actualEvent?.tags?.hermes).toEqual(undefined);
    expect((actualEvent?.contexts?.react_native_context as ReactNativeContext | undefined)?.js_engine).toEqual(
      'test_engine',
    );
  });

  it('adds component stack', async () => {
    const mockedHint: EventHint = {
      originalException: <ReactNativeError>{
        componentStack: 'test_stack',
      },
    };
    const actualEvent = await executeIntegrationFor({}, mockedHint);

    expectMocksToBeCalledOnce();
    expect((actualEvent?.contexts?.react_native_context as ReactNativeContext | undefined)?.component_stack).toEqual(
      'test_stack',
    );
  });

  it('marks turbo modules enabled', async () => {
    mockedIsTurboModuleEnabled = jest.fn().mockReturnValue(true);
    const actualEvent = await executeIntegrationFor({}, {});

    expectMocksToBeCalledOnce();
    expect((actualEvent?.contexts?.react_native_context as ReactNativeContext | undefined)?.turbo_module).toEqual(true);
  });

  it('marks fabric enabled', async () => {
    mockedIsFabricEnabled = jest.fn().mockReturnValue(true);
    const actualEvent = await executeIntegrationFor({}, {});

    expectMocksToBeCalledOnce();
    expect((actualEvent?.contexts?.react_native_context as ReactNativeContext | undefined)?.fabric).toEqual(true);
  });

  it('does not override existing react_native_context', async () => {
    const mockedEvent: Event = {
      contexts: {
        react_native_context: {
          test: 'context',
        },
      },
    };
    const actualEvent = await executeIntegrationFor(mockedEvent, {});

    expectMocksToBeCalledOnce();
    expect(actualEvent?.contexts?.react_native_context).toEqual({
      test: 'context',
    });
  });

  it('add hermes_debug_info to react_native_context based on exception frames (hermes bytecode frames present -> no debug info)', async () => {
    mockedIsHermesEnabled = jest.fn().mockReturnValue(true);

    const mockedEvent: Event = {
      exception: {
        values: [
          {
            stacktrace: {
              frames: [
                {
                  platform: 'java',
                  lineno: 2,
                },
                {
                  lineno: 1,
                },
              ],
            },
          },
        ],
      },
    };
    const actualEvent = await executeIntegrationFor(mockedEvent, {});

    expectMocksToBeCalledOnce();
    expect(actualEvent?.contexts?.react_native_context?.hermes_debug_info).toEqual(false);
  });

  it('does not hermes_debug_info to react_native_context based on threads frames (hermes bytecode frames present -> no debug info)', async () => {
    mockedIsHermesEnabled = jest.fn().mockReturnValue(true);

    const mockedEvent: Event = {
      threads: {
        values: [
          {
            stacktrace: {
              frames: [
                {
                  platform: 'java',
                  lineno: 2,
                },
                {
                  lineno: 1,
                },
              ],
            },
          },
        ],
      },
    };
    const actualEvent = await executeIntegrationFor(mockedEvent, {});

    expectMocksToBeCalledOnce();
    expect(actualEvent?.contexts?.react_native_context?.hermes_debug_info).toEqual(false);
  });

  it('adds hermes_debug_info to react_native_context (no hermes bytecode frames found -> debug info present)', async () => {
    mockedIsHermesEnabled = jest.fn().mockReturnValue(true);

    const mockedEvent: Event = {
      threads: {
        values: [
          {
            stacktrace: {
              frames: [
                {
                  platform: 'java',
                  lineno: 2,
                },
                {
                  lineno: 2,
                },
              ],
            },
          },
        ],
      },
    };
    const actualEvent = await executeIntegrationFor(mockedEvent, {});

    expectMocksToBeCalledOnce();
    expect(actualEvent?.contexts?.react_native_context?.hermes_debug_info).toEqual(true);
  });

  it('adds expo sdk version', async () => {
    mockedGetExpoSdkVersion = jest.fn().mockReturnValue('42.0.0');
    const actualEvent = await executeIntegrationFor({}, {});

    expectMocksToBeCalledOnce();
    expect((actualEvent?.contexts?.react_native_context as ReactNativeContext | undefined)?.expo_sdk_version).toEqual(
      '42.0.0',
    );
  });

  it('adds expo sdk version', async () => {
    mockedGetExpoGoVersion = jest.fn().mockReturnValue('2.6.5');
    const actualEvent = await executeIntegrationFor({}, {});

    expectMocksToBeCalledOnce();
    expect((actualEvent?.contexts?.react_native_context as ReactNativeContext | undefined)?.expo_go_version).toEqual(
      '2.6.5',
    );
  });
});

function expectMocksToBeCalledOnce() {
  expect(mockedIsHermesEnabled).toBeCalledTimes(1);
  expect(mockedIsTurboModuleEnabled).toBeCalledTimes(1);
  expect(mockedIsFabricEnabled).toBeCalledTimes(1);
  expect(mockedGetExpoGoVersion).toBeCalledTimes(1);
  expect(mockedGetExpoSdkVersion).toBeCalledTimes(1);
}

function executeIntegrationFor(mockedEvent: Event, mockedHint: EventHint): Event | null | PromiseLike<Event | null> {
  const integration = reactNativeInfoIntegration();
  return integration.processEvent!(mockedEvent, mockedHint, {} as Client);
}
