import type { Event, Metric } from '@sentry/core';

import { getClient, startInactiveSpan, timestampInSeconds } from '@sentry/core';

import type { LongTaskOptions } from '../../src/js/integrations/longTask';
import type { TestClient, TestClientOptions } from '../mocks/client';

import { longTaskIntegration } from '../../src/js/integrations/longTask';
import { RN_GLOBAL_OBJ } from '../../src/js/utils/worldwide';
import { setupTestClient } from '../mocks/client';

type Entry = { startTime: number; duration: number };
type EntriesCallback = (list: { getEntries: () => Entry[] }) => void;

class FakePerformanceObserver {
  public static supportedEntryTypes: ReadonlyArray<string> = ['longtask'];
  public static instances: FakePerformanceObserver[] = [];

  public observe = jest.fn();
  public takeRecords = jest.fn((): Entry[] => []);
  public disconnect = jest.fn();

  public constructor(public callback: EntriesCallback) {
    FakePerformanceObserver.instances.push(this);
  }

  public emit(...durations: number[]): void {
    this.emitEntries(...durations.map(duration => ({ startTime: 0, duration })));
  }

  public emitEntries(...entries: Entry[]): void {
    this.callback({ getEntries: () => entries });
  }
}

describe('longTaskIntegration', () => {
  let beforeSendMetric: jest.Mock<Metric, [Metric]>;

  const setup = (options?: LongTaskOptions, clientOptions?: Partial<TestClientOptions>): void => {
    setupTestClient({ beforeSendMetric, integrations: [longTaskIntegration(options)], ...clientOptions });
  };

  beforeEach(() => {
    beforeSendMetric = jest.fn(metric => metric);
    FakePerformanceObserver.supportedEntryTypes = ['longtask'];
    FakePerformanceObserver.instances = [];
    RN_GLOBAL_OBJ.PerformanceObserver = FakePerformanceObserver;
  });

  afterEach(() => {
    getClient()?.close();
    delete RN_GLOBAL_OBJ.PerformanceObserver;
    jest.restoreAllMocks();
  });

  it('observes buffered long tasks', () => {
    setup();

    expect(FakePerformanceObserver.instances).toHaveLength(1);
    expect(FakePerformanceObserver.instances[0]?.observe).toHaveBeenCalledWith({ type: 'longtask', buffered: true });
  });

  it('emits a duration metric for each long task at or above the default threshold of 200 ms', () => {
    setup();

    FakePerformanceObserver.instances[0]?.emit(199, 200, 350);

    expect(beforeSendMetric).toHaveBeenCalledTimes(2);
    expect(beforeSendMetric.mock.calls.map(([metric]) => metric)).toEqual([
      expect.objectContaining({
        name: 'react_native.long_task.duration',
        type: 'distribution',
        value: 200,
        unit: 'millisecond',
        attributes: expect.objectContaining({ 'sentry.origin': 'auto.react_native.long_task' }),
      }),
      expect.objectContaining({ name: 'react_native.long_task.duration', value: 350 }),
    ]);
  });

  it('uses a custom minDurationMs', () => {
    setup({ minDurationMs: 100 });

    FakePerformanceObserver.instances[0]?.emit(99, 100);

    expect(beforeSendMetric).toHaveBeenCalledTimes(1);
    expect(beforeSendMetric).toHaveBeenCalledWith(expect.objectContaining({ value: 100 }));
  });

  describe('sampleRate', () => {
    it('does not observe when the launch is not sampled', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.5);

      setup({ sampleRate: 0.5 });

      expect(FakePerformanceObserver.instances).toHaveLength(0);
    });

    it('observes when the launch is sampled', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.49);

      setup({ sampleRate: 0.5 });

      expect(FakePerformanceObserver.instances).toHaveLength(1);
    });

    it('does not observe when sampleRate is 0', () => {
      setup({ sampleRate: 0 });

      expect(FakePerformanceObserver.instances).toHaveLength(0);
    });
  });

  describe('when long tasks are not supported', () => {
    it('does nothing when PerformanceObserver is not defined', () => {
      delete RN_GLOBAL_OBJ.PerformanceObserver;

      expect(() => setup()).not.toThrow();
      expect(FakePerformanceObserver.instances).toHaveLength(0);
    });

    it('does nothing when longtask is not a supported entry type', () => {
      FakePerformanceObserver.supportedEntryTypes = ['mark', 'measure'];

      setup();

      expect(FakePerformanceObserver.instances).toHaveLength(0);
    });

    it('does nothing when supportedEntryTypes is missing', () => {
      // @ts-expect-error Simulates a runtime without the static property
      FakePerformanceObserver.supportedEntryTypes = undefined;

      setup();

      expect(FakePerformanceObserver.instances).toHaveLength(0);
    });
  });

  it('does not observe when metrics and tracing are disabled', () => {
    setup(undefined, { enableMetrics: false, tracesSampleRate: undefined });

    expect(FakePerformanceObserver.instances).toHaveLength(0);
  });

  it('does not emit metrics when metrics are disabled', () => {
    setup(undefined, { enableMetrics: false });

    FakePerformanceObserver.instances[0]?.emit(300);

    expect(beforeSendMetric).not.toHaveBeenCalled();
  });

  describe('spans', () => {
    const PERFORMANCE_NOW_MS = 100_000;
    /** The `timestampInSeconds()` value of `performance.now() === 0`. */
    let timeOriginSeconds: number;

    const observer = (): FakePerformanceObserver => FakePerformanceObserver.instances[0]!;

    const endTransaction = async (startMs: number, endMs: number): Promise<Event | undefined> => {
      startInactiveSpan({ name: 'Screen', forceTransaction: true, startTime: timeOriginSeconds + startMs / 1000 }).end(
        timeOriginSeconds + endMs / 1000,
      );
      const client = getClient<TestClient>();
      await client?.flush();
      return client?.eventQueue.find(event => event.type === 'transaction');
    };

    const longTaskSpans = (event: Event | undefined): unknown[] =>
      event?.spans?.filter(span => span.op === 'ui.long-task') ?? [];

    beforeEach(() => {
      jest.spyOn(performance, 'now').mockReturnValue(PERFORMANCE_NOW_MS);
      jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
      timeOriginSeconds = timestampInSeconds() - PERFORMANCE_NOW_MS / 1000;
    });

    it('adds long tasks that start in the transaction as ui.long-task child spans', async () => {
      setup();
      observer().emitEntries(
        { startTime: 900, duration: 300 },
        { startTime: 1_200, duration: 250 },
        { startTime: 1_900, duration: 400 },
        { startTime: 2_000, duration: 300 },
      );

      const transaction = await endTransaction(1_000, 2_000);

      expect(longTaskSpans(transaction)).toEqual([
        expect.objectContaining({
          description: 'JS thread blocked',
          op: 'ui.long-task',
          origin: 'auto.react_native.long_task',
          parent_span_id: transaction?.contexts?.trace?.span_id,
          start_timestamp: expect.closeTo(timeOriginSeconds + 1.2, 6),
          timestamp: expect.closeTo(timeOriginSeconds + 1.45, 6),
        }),
        expect.objectContaining({
          start_timestamp: expect.closeTo(timeOriginSeconds + 1.9, 6),
          timestamp: expect.closeTo(timeOriginSeconds + 2.3, 6),
        }),
      ]);
    });

    it('adds long tasks that the observer has not delivered yet', async () => {
      setup();
      observer().takeRecords.mockReturnValueOnce([{ startTime: 1_500, duration: 300 }]);

      const transaction = await endTransaction(1_000, 2_000);

      expect(longTaskSpans(transaction)).toEqual([
        expect.objectContaining({ start_timestamp: expect.closeTo(timeOriginSeconds + 1.5, 6) }),
      ]);
      expect(beforeSendMetric).toHaveBeenCalledWith(expect.objectContaining({ value: 300 }));
    });

    it('does not add long tasks shorter than minDurationMs', async () => {
      setup({ minDurationMs: 300 });
      observer().emitEntries({ startTime: 1_200, duration: 299 });

      const transaction = await endTransaction(1_000, 2_000);

      expect(longTaskSpans(transaction)).toEqual([]);
    });

    it('adds spans when metrics are disabled', async () => {
      setup(undefined, { enableMetrics: false });
      observer().emitEntries({ startTime: 1_200, duration: 300 });

      const transaction = await endTransaction(1_000, 2_000);

      expect(longTaskSpans(transaction)).toHaveLength(1);
    });

    it('does not read pending long tasks when tracing is disabled', () => {
      setup(undefined, { tracesSampleRate: undefined });

      startInactiveSpan({ name: 'Screen', forceTransaction: true }).end();

      expect(observer().takeRecords).not.toHaveBeenCalled();
    });

    it('does not add spans to unsampled transactions', () => {
      setup(undefined, { tracesSampleRate: 0 });

      startInactiveSpan({ name: 'Screen', forceTransaction: true }).end();

      expect(observer().takeRecords).not.toHaveBeenCalled();
    });

    it('keeps only the latest 100 long tasks', async () => {
      setup();
      observer().emitEntries(
        ...Array.from({ length: 101 }, (_, index) => ({ startTime: 1_000 + index, duration: 300 })),
      );

      const transaction = await endTransaction(1_000, 2_000);

      expect(longTaskSpans(transaction)).toHaveLength(100);
      expect(longTaskSpans(transaction)[0]).toEqual(
        expect.objectContaining({ start_timestamp: expect.closeTo(timeOriginSeconds + 1.001, 6) }),
      );
    });

    it('sends the transaction when reading pending long tasks throws', async () => {
      setup();
      observer().takeRecords.mockImplementationOnce(() => {
        throw new Error('native module missing');
      });

      const transaction = await endTransaction(1_000, 2_000);

      expect(transaction).toBeDefined();
    });
  });

  it('does not throw when reading supportedEntryTypes throws', () => {
    RN_GLOBAL_OBJ.PerformanceObserver = class extends FakePerformanceObserver {
      public static get supportedEntryTypes(): ReadonlyArray<string> {
        throw new Error('native module missing');
      }
    };

    expect(() => setup()).not.toThrow();
    expect(FakePerformanceObserver.instances).toHaveLength(0);
  });

  it('does not throw when observe throws', () => {
    RN_GLOBAL_OBJ.PerformanceObserver = class extends FakePerformanceObserver {
      public observe = jest.fn(() => {
        throw new Error('observe failed');
      });
    };

    expect(() => setup()).not.toThrow();
  });

  it('disconnects the observer when the client closes', async () => {
    setup();

    await getClient()?.close();

    expect(FakePerformanceObserver.instances[0]?.disconnect).toHaveBeenCalledTimes(1);
  });
});
