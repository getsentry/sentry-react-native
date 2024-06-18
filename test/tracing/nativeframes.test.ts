import {
  addGlobalEventProcessor,
  getCurrentHub,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  setCurrentClient,
  startSpan,
} from '@sentry/core';
import type { Event, Measurements } from '@sentry/types';

import { ReactNativeTracing } from '../../src/js';
import { RN_GLOBAL_OBJ } from '../../src/js/utils/worldwide';
import { NATIVE } from '../../src/js/wrapper';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';
import { mockFunction } from '../testutils';

jest.mock('../../src/js/wrapper', () => {
  return {
    NATIVE: {
      fetchNativeFrames: jest.fn().mockResolvedValue(null),
      disableNativeFramesTracking: jest.fn(),
      enableNative: true,
      enableNativeFramesTracking: jest.fn(),
    },
  };
});

jest.useFakeTimers({ advanceTimers: true });

describe('NativeFramesInstrumentation', () => {
  let client: TestClient;

  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();
    RN_GLOBAL_OBJ.__SENTRY__.globalEventProcessors = []; // resets integrations

    const integration = new ReactNativeTracing({
      enableNativeFramesTracking: true,
    });
    const options = getDefaultTestClientOptions({
      tracesSampleRate: 1.0,
      integrations: [integration],
    });
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();
    addGlobalEventProcessor(async event => {
      await wait(10);
      return event;
    });
    integration.setupOnce(addGlobalEventProcessor, getCurrentHub);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('sets native frames measurements on a transaction event', async () => {
    const startFrames = {
      totalFrames: 100,
      slowFrames: 20,
      frozenFrames: 5,
    };
    const finishFrames = {
      totalFrames: 200,
      slowFrames: 40,
      frozenFrames: 10,
    };
    mockFunction(NATIVE.fetchNativeFrames).mockResolvedValueOnce(startFrames).mockResolvedValueOnce(finishFrames);

    await startSpan({ name: 'test' }, async () => {
      await Promise.resolve(); // native frames fetch is async call this will flush the start frames fetch promise
    });

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    expect(client.event!).toEqual(
      expect.objectContaining<Partial<Event>>({
        measurements: expect.objectContaining<Measurements>({
          frames_total: {
            value: 100,
            unit: 'none',
          },
          frames_slow: {
            value: 20,
            unit: 'none',
          },
          frames_frozen: {
            value: 5,
            unit: 'none',
          },
        }),
      }),
    );
  });

  it('sets native frames measurements on a transaction event (start frames zero)', async () => {
    const startFrames = {
      totalFrames: 0,
      slowFrames: 0,
      frozenFrames: 0,
    };
    const finishFrames = {
      totalFrames: 100,
      slowFrames: 20,
      frozenFrames: 5,
    };
    mockFunction(NATIVE.fetchNativeFrames).mockResolvedValueOnce(startFrames).mockResolvedValueOnce(finishFrames);

    await startSpan({ name: 'test' }, async () => {
      await Promise.resolve(); // native frames fetch is async call this will flush the start frames fetch promise
    });

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    expect(client.event!).toEqual(
      expect.objectContaining<Partial<Event>>({
        measurements: expect.objectContaining<Measurements>({
          frames_total: {
            value: 100,
            unit: 'none',
          },
          frames_slow: {
            value: 20,
            unit: 'none',
          },
          frames_frozen: {
            value: 5,
            unit: 'none',
          },
        }),
      }),
    );
  });

  it('does not sent zero value native frames measurements', async () => {
    const startFrames = {
      totalFrames: 100,
      slowFrames: 20,
      frozenFrames: 5,
    };
    const finishFrames = {
      totalFrames: 100,
      slowFrames: 20,
      frozenFrames: 5,
    };
    mockFunction(NATIVE.fetchNativeFrames).mockResolvedValueOnce(startFrames).mockResolvedValueOnce(finishFrames);

    await startSpan({ name: 'test' }, async () => {
      await Promise.resolve(); // native frames fetch is async call this will flush the start frames fetch promise
    });

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    expect(client.event!).toEqual(
      expect.objectContaining<Partial<Event>>({
        measurements: expect.toBeOneOf([
          expect.not.objectContaining<Measurements>({
            frames_total: expect.any(Object),
            frames_slow: expect.any(Object),
            frames_frozen: expect.any(Object),
          }),
          undefined,
        ]),
      }),
    );
  });

  it('does not set measurements on transactions without startFrames', async () => {
    const startFrames = null;
    const finishFrames = {
      totalFrames: 200,
      slowFrames: 40,
      frozenFrames: 10,
    };
    mockFunction(NATIVE.fetchNativeFrames).mockResolvedValueOnce(startFrames).mockResolvedValueOnce(finishFrames);

    await startSpan({ name: 'test' }, async () => {
      await Promise.resolve(); // native frames fetch is async call this will flush the start frames fetch promise
    });

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    expect(client.event!).toEqual(
      expect.objectContaining<Partial<Event>>({
        measurements: expect.not.objectContaining({
          frames_total: {},
          frames_slow: {},
          frames_frozen: {},
        }),
      }),
    );
  });

  it('does not set measurements on transactions without finishFrames', async () => {
    const startFrames = {
      totalFrames: 100,
      slowFrames: 20,
      frozenFrames: 5,
    };
    const finishFrames = null;
    mockFunction(NATIVE.fetchNativeFrames).mockResolvedValueOnce(startFrames).mockResolvedValueOnce(finishFrames);

    await startSpan({ name: 'test' }, async () => {
      await Promise.resolve(); // native frames fetch is async call this will flush the start frames fetch promise
    });

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    expect(client.event!).toEqual(
      expect.objectContaining<Partial<Event>>({
        measurements: expect.not.objectContaining({
          frames_total: {},
          frames_slow: {},
          frames_frozen: {},
        }),
      }),
    );
  });

  it('does not set measurements on a transaction event for which finishFrames times out.', async () => {
    const startFrames = {
      totalFrames: 100,
      slowFrames: 20,
      frozenFrames: 5,
    };
    const finishFrames = {
      totalFrames: 200,
      slowFrames: 40,
      frozenFrames: 10,
    };
    mockFunction(NATIVE.fetchNativeFrames).mockResolvedValueOnce(startFrames).mockResolvedValueOnce(finishFrames);

    await startSpan({ name: 'test' }, async () => {
      await Promise.resolve(); // native frames fetch is async call this will flush the start frames fetch promise
    });

    await jest.runOnlyPendingTimersAsync();
    await jest.advanceTimersByTimeAsync(2100); // hardcoded final frames timeout 2000ms
    await client.flush();

    expect(client.event!).toEqual(
      expect.objectContaining<Partial<Event>>({
        measurements: expect.not.objectContaining({
          frames_total: {},
          frames_slow: {},
          frames_frozen: {},
        }),
      }),
    );
  });
});

function wait(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}
