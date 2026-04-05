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
      fetchNativeFramesDelay: jest.fn().mockResolvedValue(null),
      disableNativeFramesTracking: jest.fn(),
      enableNative: true,
      enableNativeFramesTracking: jest.fn(),
    },
  };
});

jest.useFakeTimers({
  advanceTimers: true,
  doNotFake: ['performance'], // Keep real performance API
});

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

  it('attaches frame data to child spans', async () => {
    const rootStartFrames = { totalFrames: 100, slowFrames: 10, frozenFrames: 5 };
    const childStartFrames = { totalFrames: 110, slowFrames: 11, frozenFrames: 6 };
    const childEndFrames = { totalFrames: 160, slowFrames: 16, frozenFrames: 8 };
    const rootEndFrames = { totalFrames: 200, slowFrames: 20, frozenFrames: 10 };

    mockFunction(NATIVE.fetchNativeFrames)
      .mockResolvedValueOnce(rootStartFrames)
      .mockResolvedValueOnce(childStartFrames)
      .mockResolvedValueOnce(childEndFrames)
      .mockResolvedValueOnce(rootEndFrames);

    await startSpan({ name: 'test' }, async () => {
      startSpan({ name: 'child-span' }, () => {});
      await Promise.resolve(); // Flush frame captures
      await Promise.resolve();
      await Promise.resolve();
    });

    await client.flush();

    expect(client.event).toBeDefined();
    const childSpan = client.event!.spans!.find(s => s.description === 'child-span');
    expect(childSpan).toBeDefined();
    expect(childSpan!.data).toEqual(
      expect.objectContaining({
        'frames.total': 50,
        'frames.slow': 5,
        'frames.frozen': 2,
      }),
    );
  });

  it('does not attach frame data to child spans when deltas are zero', async () => {
    const frames = {
      totalFrames: 100,
      slowFrames: 10,
      frozenFrames: 5,
    };
    mockFunction(NATIVE.fetchNativeFrames).mockResolvedValue(frames); // Same frames = delta of 0

    await startSpan({ name: 'test' }, async () => {
      startSpan({ name: 'child-span' }, () => {});
      await Promise.resolve(); // Flush frame captures
      await Promise.resolve();
      await Promise.resolve();
    });

    await client.flush();

    expect(client.event).toBeDefined();
    const childSpan = client.event!.spans!.find(s => s.description === 'child-span');
    expect(childSpan).toBeDefined();
    expect(childSpan!.data).not.toHaveProperty('frames.total');
    expect(childSpan!.data).not.toHaveProperty('frames.slow');
    expect(childSpan!.data).not.toHaveProperty('frames.frozen');
  });

  it('falls back to last child span end frames when root span end timestamp does not match event timestamp (idle transaction trim)', async () => {
    // Simulate idle transaction trimming: an event processor before NativeFrames shifts
    // event.timestamp back to the child span's end time. This makes the root span's end frames
    // timestamp (captured at idle timeout) no longer match within the 50ms margin of error,
    // forcing processEvent to fall back to the child span's end frames.
    let childEndTimestamp: number | undefined;
    asyncProcessorBeforeNativeFrames = async (event: Event) => {
      if (event.timestamp && childEndTimestamp) {
        event.timestamp = childEndTimestamp; // Trim to child span end time (simulates idle trimEnd)
      }
      return event;
    };

    const rootStartFrames = { totalFrames: 100, slowFrames: 10, frozenFrames: 5 };
    const childStartFrames = { totalFrames: 110, slowFrames: 11, frozenFrames: 6 };
    const childEndFrames = { totalFrames: 160, slowFrames: 16, frozenFrames: 8 };
    const rootEndFrames = { totalFrames: 200, slowFrames: 20, frozenFrames: 10 };

    mockFunction(NATIVE.fetchNativeFrames)
      .mockResolvedValueOnce(rootStartFrames) // root span start
      .mockResolvedValueOnce(childStartFrames) // child span start
      .mockResolvedValueOnce(childEndFrames) // child span end (fallback + span attributes)
      .mockResolvedValueOnce(rootEndFrames) // root span end (stored in endMap)
      .mockResolvedValueOnce(rootEndFrames); // root span end (for span attributes)

    await startSpan({ name: 'idle-transaction' }, async () => {
      startSpan({ name: 'child-activity' }, () => {
        // Child span ends here at current mock time
        childEndTimestamp = Date.now() / 1000;
      });
      await Promise.resolve(); // Flush frame captures
      await Promise.resolve();
      await Promise.resolve();

      // Advance time to simulate idle timeout gap (1 second > 50ms margin)
      global.Date.now = jest.fn(() => mockDate.getTime() + 1000);
      // Root span ends here at the advanced time
    });

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    // The root span end frames timestamp won't match event.timestamp (off by 1s > 50ms margin),
    // so processEvent falls back to the child span end frames.
    // measurements = childEndFrames - rootStartFrames
    expect(client.event!).toEqual(
      expect.objectContaining<Partial<Event>>({
        measurements: expect.objectContaining<Measurements>({
          frames_total: {
            value: 60, // 160 - 100
            unit: 'none',
          },
          frames_slow: {
            value: 6, // 16 - 10
            unit: 'none',
          },
          frames_frozen: {
            value: 3, // 8 - 5
            unit: 'none',
          },
        }),
      }),
    );
  });

  it('attaches frame data to multiple child spans', async () => {
    const rootStartFrames = { totalFrames: 100, slowFrames: 10, frozenFrames: 5 };
    const child1StartFrames = { totalFrames: 100, slowFrames: 10, frozenFrames: 5 };
    const child2StartFrames = { totalFrames: 120, slowFrames: 12, frozenFrames: 6 };
    const child1EndFrames = { totalFrames: 120, slowFrames: 12, frozenFrames: 6 };
    const child2EndFrames = { totalFrames: 150, slowFrames: 15, frozenFrames: 8 };
    const rootEndFrames = { totalFrames: 200, slowFrames: 20, frozenFrames: 10 };

    mockFunction(NATIVE.fetchNativeFrames)
      .mockResolvedValueOnce(rootStartFrames)
      .mockResolvedValueOnce(child1StartFrames)
      .mockResolvedValueOnce(child2StartFrames)
      .mockResolvedValueOnce(child1EndFrames)
      .mockResolvedValueOnce(child2EndFrames)
      .mockResolvedValueOnce(rootEndFrames);

    await startSpan({ name: 'test' }, async () => {
      startSpan({ name: 'child-span-1' }, () => {});
      startSpan({ name: 'child-span-2' }, () => {});

      await Promise.resolve(); // Flush all frame captures
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await client.flush();

    expect(client.event).toBeDefined();

    const childSpan1 = client.event!.spans!.find(s => s.description === 'child-span-1');
    expect(childSpan1).toBeDefined();
    expect(childSpan1!.data).toEqual(
      expect.objectContaining({
        'frames.total': 20,
        'frames.slow': 2,
        'frames.frozen': 1,
      }),
    );

    const childSpan2 = client.event!.spans!.find(s => s.description === 'child-span-2');
    expect(childSpan2).toBeDefined();
    expect(childSpan2!.data).toEqual(
      expect.objectContaining({
        'frames.total': 30,
        'frames.slow': 3,
        'frames.frozen': 2,
      }),
    );
  });

  it('does not mix up child end frames between overlapping transactions', async () => {
    // During txn-1's event processing, txn-2 starts and its child ends,
    // writing to the per-root-span map. txn-1's processEvent should still
    // read its own child's end frames, not txn-2's.
    let txn1ChildEndTimestamp: number | undefined;

    const txn2RootStart = { totalFrames: 900, slowFrames: 90, frozenFrames: 45 };
    const txn2ChildStart = { totalFrames: 910, slowFrames: 91, frozenFrames: 46 };
    const txn2ChildEnd = { totalFrames: 950, slowFrames: 95, frozenFrames: 48 };
    const txn2RootEnd = { totalFrames: 999, slowFrames: 99, frozenFrames: 49 };

    asyncProcessorBeforeNativeFrames = async (event: Event) => {
      if (event.transaction === 'txn-1' && txn1ChildEndTimestamp) {
        event.timestamp = txn1ChildEndTimestamp; // Simulate idle trim

        // Start and complete txn-2 during txn-1's event processing.
        // With a global variable (old code), txn-2's child end would overwrite txn-1's data.
        // Clear scope so txn-2 is a new root span, not a child of txn-1.
        getCurrentScope().clear();
        await startSpan({ name: 'txn-2' }, async () => {
          startSpan({ name: 'txn-2-child' }, () => {});
          await Promise.resolve();
          await Promise.resolve();
        });
      }
      return event;
    };

    const txn1RootStart = { totalFrames: 100, slowFrames: 10, frozenFrames: 5 };
    const txn1ChildStart = { totalFrames: 110, slowFrames: 11, frozenFrames: 6 };
    const txn1ChildEnd = { totalFrames: 160, slowFrames: 16, frozenFrames: 8 };
    const txn1RootEnd = { totalFrames: 200, slowFrames: 20, frozenFrames: 10 };

    mockFunction(NATIVE.fetchNativeFrames)
      .mockResolvedValueOnce(txn1RootStart) // txn-1 root start
      .mockResolvedValueOnce(txn1ChildStart) // txn-1 child start
      .mockResolvedValueOnce(txn1ChildEnd) // txn-1 child end
      .mockResolvedValueOnce(txn1RootEnd) // txn-1 root end (endMap)
      .mockResolvedValueOnce(txn1RootEnd) // txn-1 root end (span attributes)
      // txn-2 mocks (consumed during txn-1's async processor)
      .mockResolvedValueOnce(txn2RootStart) // txn-2 root start
      .mockResolvedValueOnce(txn2ChildStart) // txn-2 child start
      .mockResolvedValueOnce(txn2ChildEnd) // txn-2 child end
      .mockResolvedValueOnce(txn2RootEnd) // txn-2 root end (endMap)
      .mockResolvedValueOnce(txn2RootEnd); // txn-2 root end (span attributes)

    await startSpan({ name: 'txn-1' }, async () => {
      startSpan({ name: 'txn-1-child' }, () => {
        txn1ChildEndTimestamp = Date.now() / 1000;
      });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      // Advance time to simulate idle timeout (root end timestamp won't match child end)
      global.Date.now = jest.fn(() => mockDate.getTime() + 1000);
    });

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    // txn-1 should use its own child end frames, not txn-2's
    // measurements = txn1ChildEnd - txn1RootStart
    const txn1Event = client.eventQueue.find(e => e.transaction === 'txn-1');
    expect(txn1Event).toBeDefined();
    expect(txn1Event!.measurements).toEqual(
      expect.objectContaining<Measurements>({
        frames_total: { value: 60, unit: 'none' }, // 160 - 100
        frames_slow: { value: 6, unit: 'none' }, // 16 - 10
        frames_frozen: { value: 3, unit: 'none' }, // 8 - 5
      }),
    );
  });

  describe('unsampled spans', () => {
    beforeEach(() => {
      global.Date.now = jest.fn(() => mockDate.getTime());

      getCurrentScope().clear();
      getIsolationScope().clear();
      getGlobalScope().clear();

      const options = getDefaultTestClientOptions({
        tracesSampleRate: 0,
        enableNativeFramesTracking: true,
        integrations: [nativeFramesIntegration()],
      });
      client = new TestClient(options);
      setCurrentClient(client);
      client.init();
    });

    it('does not fetch native frames for unsampled spans', () => {
      startSpan({ name: 'unsampled transaction', forceTransaction: true }, () => {
        // span starts and ends — no work expected
      });

      expect(NATIVE.fetchNativeFrames).not.toHaveBeenCalled();
    });
  });

  describe('frames.delay', () => {
    it('attaches frames.delay to child spans', async () => {
      const rootStartFrames = { totalFrames: 100, slowFrames: 10, frozenFrames: 5 };
      const childStartFrames = { totalFrames: 110, slowFrames: 11, frozenFrames: 6 };
      const childEndFrames = { totalFrames: 160, slowFrames: 16, frozenFrames: 8 };
      const rootEndFrames = { totalFrames: 200, slowFrames: 20, frozenFrames: 10 };

      mockFunction(NATIVE.fetchNativeFrames)
        .mockResolvedValueOnce(rootStartFrames)
        .mockResolvedValueOnce(childStartFrames)
        .mockResolvedValueOnce(childEndFrames)
        .mockResolvedValueOnce(rootEndFrames);

      mockFunction(NATIVE.fetchNativeFramesDelay).mockResolvedValue(0.131674);

      await startSpan({ name: 'test' }, async () => {
        startSpan({ name: 'child-span' }, () => {});
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      await client.flush();

      expect(client.event).toBeDefined();
      const childSpan = client.event!.spans!.find(s => s.description === 'child-span');
      expect(childSpan).toBeDefined();
      expect(childSpan!.data).toEqual(
        expect.objectContaining({
          'frames.delay': 0.131674,
        }),
      );
    });

    it('does not attach frames.delay when native returns null', async () => {
      const rootStartFrames = { totalFrames: 100, slowFrames: 10, frozenFrames: 5 };
      const childStartFrames = { totalFrames: 110, slowFrames: 11, frozenFrames: 6 };
      const childEndFrames = { totalFrames: 160, slowFrames: 16, frozenFrames: 8 };
      const rootEndFrames = { totalFrames: 200, slowFrames: 20, frozenFrames: 10 };

      mockFunction(NATIVE.fetchNativeFrames)
        .mockResolvedValueOnce(rootStartFrames)
        .mockResolvedValueOnce(childStartFrames)
        .mockResolvedValueOnce(childEndFrames)
        .mockResolvedValueOnce(rootEndFrames);

      mockFunction(NATIVE.fetchNativeFramesDelay).mockResolvedValue(null);

      await startSpan({ name: 'test' }, async () => {
        startSpan({ name: 'child-span' }, () => {});
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      await client.flush();

      expect(client.event).toBeDefined();
      const childSpan = client.event!.spans!.find(s => s.description === 'child-span');
      expect(childSpan).toBeDefined();
      expect(childSpan!.data).not.toHaveProperty('frames.delay');
    });
  });
});
