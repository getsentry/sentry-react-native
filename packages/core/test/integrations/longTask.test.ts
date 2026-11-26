import type { Event, Metric } from '@sentry/core';

import { getClient, startIdleSpan, startInactiveSpan, startSpanManual, timestampInSeconds } from '@sentry/core';

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

  it('does not observe when metrics and spans are disabled', () => {
    setup(undefined, { enableMetrics: false });

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

    const setupWithSpans = (options?: LongTaskOptions, clientOptions?: Partial<TestClientOptions>): void =>
      setup({ spans: true, ...options }, clientOptions);

    const observer = (): FakePerformanceObserver => FakePerformanceObserver.instances[0]!;

    const at = (ms: number): number => timeOriginSeconds + ms / 1000;

    const sentTransaction = async (): Promise<Event | undefined> => {
      const client = getClient<TestClient>();
      await client?.flush();
      return client?.eventQueue.find(event => event.type === 'transaction');
    };

    const endTransaction = async (startMs: number, endMs: number): Promise<Event | undefined> => {
      startInactiveSpan({ name: 'Screen', forceTransaction: true, startTime: at(startMs) }).end(at(endMs));
      return sentTransaction();
    };

    const longTaskSpans = (event: Event | undefined): unknown[] =>
      event?.spans?.filter(span => span.op === 'ui.long-task') ?? [];

    beforeEach(() => {
      jest.spyOn(performance, 'now').mockReturnValue(PERFORMANCE_NOW_MS);
      jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
      timeOriginSeconds = timestampInSeconds() - PERFORMANCE_NOW_MS / 1000;
    });

    it('adds long tasks that overlap the transaction as ui.long-task child spans', async () => {
      setupWithSpans();
      observer().emitEntries(
        { startTime: 700, duration: 300 },
        { startTime: 900, duration: 300 },
        { startTime: 1_900, duration: 400 },
        { startTime: 2_000, duration: 300 },
      );

      const transaction = await endTransaction(1_000, 2_000);

      expect(longTaskSpans(transaction)).toEqual([
        expect.objectContaining({
          description: 'JS thread blocked',
          op: 'ui.long-task',
          origin: 'auto.ui.long_task',
          parent_span_id: transaction?.contexts?.trace?.span_id,
          start_timestamp: expect.closeTo(at(900), 6),
          timestamp: expect.closeTo(at(1_200), 6),
          data: expect.objectContaining({ 'thread.name': 'javascript' }),
        }),
        expect.objectContaining({
          start_timestamp: expect.closeTo(at(1_900), 6),
          timestamp: expect.closeTo(at(2_300), 6),
        }),
      ]);
    });

    it('adds long tasks that the observer delivers while the transaction is open as child spans', async () => {
      setupWithSpans();

      startSpanManual({ name: 'Screen', forceTransaction: true, startTime: at(1_000) }, span => {
        observer().emitEntries({ startTime: 700, duration: 200 }, { startTime: 900, duration: 300 });
        span.end(at(2_000));
      });
      const transaction = await sentTransaction();

      expect(longTaskSpans(transaction)).toEqual([
        expect.objectContaining({
          description: 'JS thread blocked',
          op: 'ui.long-task',
          origin: 'auto.ui.long_task',
          parent_span_id: transaction?.contexts?.trace?.span_id,
          start_timestamp: expect.closeTo(at(900), 6),
          timestamp: expect.closeTo(at(1_200), 6),
          data: expect.objectContaining({ 'thread.name': 'javascript' }),
        }),
      ]);
    });

    it('keeps an idle transaction open for long tasks after its last child span', async () => {
      setupWithSpans();

      const idleSpan = startIdleSpan({ name: 'Screen', startTime: at(1_000) });
      startInactiveSpan({ name: 'child', startTime: at(1_000) }).end(at(1_500));
      observer().emitEntries({ startTime: 1_600, duration: 300 });
      idleSpan.end(at(3_000));
      const transaction = await sentTransaction();

      expect(transaction?.timestamp).toBeCloseTo(at(1_900), 6);
      expect(longTaskSpans(transaction)).toEqual([
        expect.objectContaining({ start_timestamp: expect.closeTo(at(1_600), 6) }),
      ]);
    });

    it('lets only the long tasks in the idle timeout after the last other child extend an idle transaction', async () => {
      setupWithSpans();

      const idleSpan = startIdleSpan({ name: 'Screen', startTime: at(1_000) });
      startInactiveSpan({ name: 'child', startTime: at(1_000) }).end(at(1_500));
      observer().emitEntries({ startTime: 1_600, duration: 300 });
      observer().emitEntries({ startTime: 2_400, duration: 300 });
      observer().emitEntries({ startTime: 3_200, duration: 300 });
      idleSpan.end(at(5_000));
      const transaction = await sentTransaction();

      expect(transaction?.timestamp).toBeCloseTo(at(2_700), 6);
      expect(longTaskSpans(transaction)).toEqual([
        expect.objectContaining({ start_timestamp: expect.closeTo(at(1_600), 6) }),
        expect.objectContaining({ start_timestamp: expect.closeTo(at(2_400), 6) }),
      ]);
    });

    it('does not add spans without the spans option', async () => {
      setup();
      observer().emitEntries({ startTime: 1_200, duration: 300 });

      const transaction = await endTransaction(1_000, 2_000);

      expect(longTaskSpans(transaction)).toEqual([]);
      expect(observer().takeRecords).not.toHaveBeenCalled();
    });

    it('adds long tasks that the observer has not delivered yet', async () => {
      setupWithSpans();
      observer().takeRecords.mockReturnValueOnce([{ startTime: 1_500, duration: 300 }]);

      const transaction = await endTransaction(1_000, 2_000);

      expect(longTaskSpans(transaction)).toEqual([
        expect.objectContaining({ start_timestamp: expect.closeTo(at(1_500), 6) }),
      ]);
      expect(beforeSendMetric).toHaveBeenCalledWith(expect.objectContaining({ value: 300 }));
    });

    it('does not add long tasks shorter than minDurationMs', async () => {
      setupWithSpans({ minDurationMs: 300 });
      observer().emitEntries({ startTime: 1_200, duration: 299 });

      const transaction = await endTransaction(1_000, 2_000);

      expect(longTaskSpans(transaction)).toEqual([]);
    });

    it('adds spans when metrics are disabled', async () => {
      setupWithSpans(undefined, { enableMetrics: false });
      observer().emitEntries({ startTime: 1_200, duration: 300 });

      const transaction = await endTransaction(1_000, 2_000);

      expect(longTaskSpans(transaction)).toHaveLength(1);
    });

    it('does not read pending long tasks when tracing is disabled', () => {
      setupWithSpans(undefined, { tracesSampleRate: undefined });

      startInactiveSpan({ name: 'Screen', forceTransaction: true }).end();

      expect(observer().takeRecords).not.toHaveBeenCalled();
    });

    it('does not add spans to unsampled transactions', () => {
      setupWithSpans(undefined, { tracesSampleRate: 0 });

      startInactiveSpan({ name: 'Screen', forceTransaction: true }).end();

      expect(observer().takeRecords).not.toHaveBeenCalled();
    });

    it('keeps only the latest 100 long tasks', async () => {
      setupWithSpans();
      observer().emitEntries(
        ...Array.from({ length: 101 }, (_, index) => ({ startTime: 1_000 + index, duration: 300 })),
      );

      const transaction = await endTransaction(1_000, 2_000);

      expect(longTaskSpans(transaction)).toHaveLength(100);
      expect(longTaskSpans(transaction)[0]).toEqual(
        expect.objectContaining({ start_timestamp: expect.closeTo(at(1_001), 6) }),
      );
    });

    it('sends the transaction when reading pending long tasks throws', async () => {
      setupWithSpans();
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
