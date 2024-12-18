import type { Event, Measurements } from '@sentry/core';
import { getCurrentScope, getGlobalScope, getIsolationScope, setCurrentClient, startSpan } from '@sentry/core';

import { nativeFramesIntegration } from '../../../src/js';
import { NATIVE } from '../../../src/js/wrapper';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';
import { mockFunction } from '../../testutils';

jest.mock('../../../src/js/wrapper', () => {
  return {
    NATIVE: {
      fetchNativeFrames: jest.fn(),
      disableNativeFramesTracking: jest.fn(),
      enableNative: true,
      enableNativeFramesTracking: jest.fn(),
    },
  };
});

jest.useFakeTimers({ advanceTimers: true });

const mockDate = new Date(2024, 7, 14); // Set your desired mock date here
const originalDateNow = Date.now; // Store the original Date.now function

describe('NativeFramesInstrumentation', () => {
  let client: TestClient;
  let asyncProcessorBeforeNativeFrames: (event: Event) => Promise<Event> = async (event: Event) => event;

  beforeEach(() => {
    global.Date.now = jest.fn(() => mockDate.getTime());

    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();

    const options = getDefaultTestClientOptions({
      tracesSampleRate: 1.0,
      enableNativeFramesTracking: true,
      integrations: [
        {
          name: 'MockAsyncIntegration',
          processEvent: e => asyncProcessorBeforeNativeFrames(e),
        },
        nativeFramesIntegration(),
      ],
    });
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
    global.Date.now = originalDateNow;
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

    expect(client.event!).toBeOneOf([
      expect.not.objectContaining<Partial<Event>>({
        measurements: expect.anything(),
      }),
      expect.objectContaining<Partial<Event>>({
        measurements: expect.not.objectContaining<Measurements>({
          frames_total: expect.any(Object),
          frames_slow: expect.any(Object),
          frames_frozen: expect.any(Object),
        }),
      }),
    ]);
  });

  it('does not set measurements on transactions without startFrames', async () => {
    const startFrames: null = null;
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

    expect(client.event!).toBeOneOf([
      expect.not.objectContaining<Partial<Event>>({
        measurements: expect.anything(),
      }),
      expect.objectContaining<Partial<Event>>({
        measurements: expect.not.objectContaining<Measurements>({
          frames_total: expect.any(Object),
          frames_slow: expect.any(Object),
          frames_frozen: expect.any(Object),
        }),
      }),
    ]);
  });

  it('does not set measurements on transactions without finishFrames', async () => {
    const startFrames = {
      totalFrames: 100,
      slowFrames: 20,
      frozenFrames: 5,
    };
    const finishFrames: null = null;
    mockFunction(NATIVE.fetchNativeFrames).mockResolvedValueOnce(startFrames).mockResolvedValueOnce(finishFrames);

    await startSpan({ name: 'test' }, async () => {
      await Promise.resolve(); // native frames fetch is async call this will flush the start frames fetch promise
    });

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    expect(client.event!).toBeOneOf([
      expect.not.objectContaining<Partial<Event>>({
        measurements: expect.anything(),
      }),
      expect.objectContaining<Partial<Event>>({
        measurements: expect.not.objectContaining<Measurements>({
          frames_total: expect.any(Object),
          frames_slow: expect.any(Object),
          frames_frozen: expect.any(Object),
        }),
      }),
    ]);
  });

  it('does not set measurements on a transaction event for which finishFrames times out.', async () => {
    asyncProcessorBeforeNativeFrames = async (event: Event) => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      global.Date.now = jest.fn(() => mockDate.getTime() + 2100); // hardcoded final frames timeout 2000ms
      await jest.runOnlyPendingTimersAsync();
      await jest.advanceTimersByTimeAsync(2100); // hardcoded final frames timeout 2000ms
      return event;
    };

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

    await client.flush();

    expect(client.event!).toBeOneOf([
      expect.not.objectContaining<Partial<Event>>({
        measurements: expect.anything(),
      }),
      expect.objectContaining<Partial<Event>>({
        measurements: expect.not.objectContaining<Measurements>({
          frames_total: expect.any(Object),
          frames_slow: expect.any(Object),
          frames_frozen: expect.any(Object),
        }),
      }),
    ]);
  });
});
