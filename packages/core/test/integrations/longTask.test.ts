import type { Metric } from '@sentry/core';

import { getClient } from '@sentry/core';

import type { LongTaskOptions } from '../../src/js/integrations/longTask';

import { longTaskIntegration } from '../../src/js/integrations/longTask';
import { RN_GLOBAL_OBJ } from '../../src/js/utils/worldwide';
import { setupTestClient } from '../mocks/client';

type EntriesCallback = (list: { getEntries: () => Array<{ duration: number }> }) => void;

class FakePerformanceObserver {
  public static supportedEntryTypes: ReadonlyArray<string> = ['longtask'];
  public static instances: FakePerformanceObserver[] = [];

  public observe = jest.fn();
  public disconnect = jest.fn();

  public constructor(public callback: EntriesCallback) {
    FakePerformanceObserver.instances.push(this);
  }

  public emit(...durations: number[]): void {
    this.callback({ getEntries: () => durations.map(duration => ({ duration })) });
  }
}

describe('longTaskIntegration', () => {
  let beforeSendMetric: jest.Mock<Metric, [Metric]>;

  const setup = (options?: LongTaskOptions): void => {
    setupTestClient({ beforeSendMetric, integrations: [longTaskIntegration(options)] });
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
