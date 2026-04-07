jest.mock('../../src/js/utils/environment');

import type { Client, Event, EventHint } from '@sentry/core';

import { defaultStackParser } from '@sentry/browser';
import { Platform } from 'react-native';

import { nativeStackRecoveryIntegration } from '../../src/js/integrations/nativestackrecovery';
import { notWeb } from '../../src/js/utils/environment';
import { NATIVE } from '../../src/js/wrapper';

jest.mock('../../src/js/wrapper');

function executeIntegrationFor(mockedEvent: Event, mockedHint: EventHint): Event {
  const mockedClient = {
    getOptions: () => ({ stackParser: defaultStackParser }),
  } as unknown as Client;

  const integration = nativeStackRecoveryIntegration();
  integration.preprocessEvent!(mockedEvent, mockedHint, mockedClient);
  return mockedEvent;
}

describe('NativeStackRecovery', () => {
  let originalPlatformOS: typeof Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    originalPlatformOS = Platform.OS;
    Platform.OS = 'android';
    (notWeb as jest.Mock).mockReturnValue(true);
    (NATIVE as any).enableNative = true;
  });

  afterEach(() => {
    Platform.OS = originalPlatformOS;
  });

  it('does nothing when native is disabled', () => {
    (NATIVE as any).enableNative = false;
    (NATIVE.fetchCachedJavascriptExceptionStack as jest.Mock).mockReturnValue('Error: test\n    at foo (file.js:1:1)');

    const event = executeIntegrationFor(
      {
        exception: {
          values: [{ type: 'Error', value: 'test' }],
        },
      },
      {},
    );

    expect(NATIVE.fetchCachedJavascriptExceptionStack).not.toHaveBeenCalled();
    expect(event.exception?.values?.[0].stacktrace).toBeUndefined();
  });

  it('does nothing on non-android platforms', () => {
    Platform.OS = 'ios';
    (NATIVE.fetchCachedJavascriptExceptionStack as jest.Mock).mockReturnValue('Error: test\n    at foo (file.js:1:1)');

    const event = executeIntegrationFor(
      {
        exception: {
          values: [{ type: 'Error', value: 'test' }],
        },
      },
      {},
    );

    expect(NATIVE.fetchCachedJavascriptExceptionStack).not.toHaveBeenCalled();
    expect(event.exception?.values?.[0].stacktrace).toBeUndefined();
  });

  it('does nothing when the event already has stacktrace frames', () => {
    const event = executeIntegrationFor(
      {
        exception: {
          values: [
            {
              type: 'Error',
              value: 'test',
              stacktrace: {
                frames: [
                  {
                    filename: 'app.js',
                    function: 'myFunc',
                    lineno: 10,
                    colno: 5,
                    in_app: true,
                  },
                ],
              },
            },
          ],
        },
      },
      {},
    );

    expect(NATIVE.fetchCachedJavascriptExceptionStack).not.toHaveBeenCalled();
    expect(event.exception?.values?.[0].stacktrace?.frames).toHaveLength(1);
  });

  it('does nothing when no cached stack is available', () => {
    (NATIVE.fetchCachedJavascriptExceptionStack as jest.Mock).mockReturnValue(null);

    const event = executeIntegrationFor(
      {
        exception: {
          values: [{ type: 'Error', value: 'test' }],
        },
      },
      {},
    );

    expect(NATIVE.fetchCachedJavascriptExceptionStack).toHaveBeenCalledTimes(1);
    expect(event.exception?.values?.[0].stacktrace).toBeUndefined();
  });

  it('parses and attaches frames when cached stack is available and event has no frames', () => {
    const cachedStack = [
      'Error: Value is undefined, expected an Object',
      '    at UserMessage (http://localhost:8081/index.bundle:1:5274251)',
      '    at renderItem (http://localhost:8081/index.bundle:1:5280705)',
      '    at Container (http://localhost:8081/index.bundle:1:5288922)',
    ].join('\n');

    (NATIVE.fetchCachedJavascriptExceptionStack as jest.Mock).mockReturnValue(cachedStack);

    const event = executeIntegrationFor(
      {
        exception: {
          values: [{ type: 'Error', value: 'Value is undefined, expected an Object' }],
        },
      },
      {},
    );

    expect(event.exception?.values?.[0].stacktrace?.frames).toBeDefined();
    expect(event.exception?.values?.[0].stacktrace!.frames!.length).toBeGreaterThan(0);
  });

  it('does nothing when cached stack cannot be parsed', () => {
    (NATIVE.fetchCachedJavascriptExceptionStack as jest.Mock).mockReturnValue('not a valid stack trace');

    const event = executeIntegrationFor(
      {
        exception: {
          values: [{ type: 'Error', value: 'test' }],
        },
      },
      {},
    );

    expect(event.exception?.values?.[0].stacktrace).toBeUndefined();
  });

  it('does nothing when event has no exception', () => {
    (NATIVE.fetchCachedJavascriptExceptionStack as jest.Mock).mockReturnValue('Error: test\n    at foo (file.js:1:1)');

    executeIntegrationFor({}, {});

    expect(NATIVE.fetchCachedJavascriptExceptionStack).not.toHaveBeenCalled();
  });

  it('does nothing when exception has empty frames array', () => {
    const cachedStack = ['Error: test', '    at foo (http://localhost:8081/index.bundle:1:100)'].join('\n');

    (NATIVE.fetchCachedJavascriptExceptionStack as jest.Mock).mockReturnValue(cachedStack);

    const event = executeIntegrationFor(
      {
        exception: {
          values: [
            {
              type: 'Error',
              value: 'test',
              stacktrace: { frames: [] },
            },
          ],
        },
      },
      {},
    );

    expect(NATIVE.fetchCachedJavascriptExceptionStack).toHaveBeenCalledTimes(1);
    expect(event.exception?.values?.[0].stacktrace?.frames!.length).toBeGreaterThan(0);
  });

  it('only patches the primary exception (values[0]) when multiple exception values exist', () => {
    const cachedStack = ['Error: test', '    at foo (http://localhost:8081/index.bundle:1:100)'].join('\n');

    (NATIVE.fetchCachedJavascriptExceptionStack as jest.Mock).mockReturnValue(cachedStack);

    const event = executeIntegrationFor(
      {
        exception: {
          values: [
            { type: 'Error', value: 'primary error without stack' },
            {
              type: 'Error',
              value: 'linked cause',
              stacktrace: {
                frames: [{ filename: 'cause.js', function: 'causeFn', lineno: 5, colno: 1, in_app: true }],
              },
            },
          ],
        },
      },
      {},
    );

    expect(event.exception?.values?.[0].stacktrace?.frames!.length).toBeGreaterThan(0);
    expect(event.exception?.values?.[1].stacktrace?.frames).toHaveLength(1);
    expect(event.exception?.values?.[1].stacktrace?.frames![0].filename).toBe('cause.js');
  });
});
