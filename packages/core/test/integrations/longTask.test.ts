import type { Metric } from '@sentry/core';

import { getClient, startInactiveSpan } from '@sentry/core';
import { AppState } from 'react-native';

import type { LongTaskOptions } from '../../src/js/integrations/longTask';
import type { TestClientOptions } from '../mocks/client';

import { longTaskIntegration } from '../../src/js/integrations/longTask';
import { _clearAppStartEndData, _setAppStartEndData } from '../../src/js/tracing/integrations/appStart';
import { reactNativeTracingIntegration } from '../../src/js/tracing/reactnativetracing';
import { RN_GLOBAL_OBJ } from '../../src/js/utils/worldwide';
import { setupTestClient } from '../mocks/client';

type Entry = { startTime: number; duration: number };
type EntriesCallback = (list: { getEntries: () => Entry[] }) => void;

class FakePerformanceObserver {
  public static supportedEntryTypes: ReadonlyArray<string> = ['longtask'];
  public static instances: FakePerformanceObserver[] = [];

  public observe = jest.fn();
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
    _setAppStartEndData({ timestampMs: 0, endFrames: null });
  });

  afterEach(() => {
    getClient()?.close();
    delete RN_GLOBAL_OBJ.PerformanceObserver;
    _clearAppStartEndData();
    jest.restoreAllMocks();
    jest.useRealTimers();
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

  it('does not observe when metrics are disabled', () => {
    setup(undefined, { enableMetrics: false });

    expect(FakePerformanceObserver.instances).toHaveLength(0);
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

  describe('context at the start of the task', () => {
    const START_MS = 1_700_000_000_000;
    let nowMs: number;

    const observer = (): FakePerformanceObserver => FakePerformanceObserver.instances[0]!;
    const at = (ms: number): number => (START_MS + ms) / 1000;
    const advanceTo = (ms: number): void => {
      nowMs = ms;
    };
    const metricAttributes = (): Array<Record<string, unknown> | undefined> =>
      beforeSendMetric.mock.calls.map(([metric]) => metric.attributes);
    const changeAppState = (state: string): void => {
      const listener = (AppState.addEventListener as jest.Mock).mock.calls.at(-1)?.[1];
      listener(state);
    };

    beforeEach(() => {
      nowMs = 0;
      jest.spyOn(performance, 'now').mockImplementation(() => nowMs);
      jest.spyOn(Date, 'now').mockImplementation(() => START_MS + nowMs);
      (AppState as { currentState: string }).currentState = 'active';
    });

    it('adds the route at the start of each task', () => {
      const tracing = reactNativeTracingIntegration();
      setup(undefined, { integrations: [tracing, longTaskIntegration()] });

      advanceTo(1_000);
      tracing.setCurrentRoute('Home');
      advanceTo(2_000);
      tracing.setCurrentRoute('Settings');
      advanceTo(5_000);
      observer().emitEntries(
        { startTime: 500, duration: 300 },
        { startTime: 1_500, duration: 300 },
        {
          startTime: 2_500,
          duration: 300,
        },
      );

      expect(metricAttributes()).toEqual([
        expect.not.objectContaining({ route: expect.anything() }),
        expect.objectContaining({ route: 'Home' }),
        expect.objectContaining({ route: 'Settings' }),
      ]);
    });

    it('adds the foreground state at the start of each task', () => {
      setup();

      advanceTo(2_000);
      changeAppState('background');
      advanceTo(5_000);
      observer().emitEntries({ startTime: 1_500, duration: 300 }, { startTime: 2_500, duration: 300 });

      expect(metricAttributes()).toEqual([
        expect.objectContaining({ 'app.in_foreground': true }),
        expect.objectContaining({ 'app.in_foreground': false }),
      ]);
    });

    it('does not add the foreground state when the app state is unknown', () => {
      (AppState as { currentState: string }).currentState = 'unknown';
      setup();

      observer().emitEntries({ startTime: 0, duration: 300 });

      expect(metricAttributes()).toEqual([expect.not.objectContaining({ 'app.in_foreground': expect.anything() })]);
    });

    it('adds the name and op of the root span at the start of each task', () => {
      setup();

      startInactiveSpan({ name: 'Home', op: 'navigation', forceTransaction: true, startTime: at(1_000) }).end(
        at(2_000),
      );
      advanceTo(5_000);
      observer().emitEntries({ startTime: 1_500, duration: 300 }, { startTime: 2_500, duration: 300 });

      expect(metricAttributes()).toEqual([
        expect.objectContaining({ 'sentry.segment.name': 'Home', 'sentry.op': 'navigation' }),
        expect.anything(),
      ]);
      expect(metricAttributes()[1]).not.toHaveProperty('sentry.segment.name');
      expect(metricAttributes()[1]).not.toHaveProperty('sentry.op');
    });

    it('adds the app start phase of each task', () => {
      _setAppStartEndData({ timestampMs: START_MS + 2_000, endFrames: null });
      setup();

      advanceTo(5_000);
      observer().emitEntries({ startTime: 1_500, duration: 300 }, { startTime: 2_500, duration: 300 });

      expect(metricAttributes()).toEqual([
        expect.objectContaining({ 'app.start_phase': 'app_start' }),
        expect.objectContaining({ 'app.start_phase': 'steady_state' }),
      ]);
    });

    describe('before the app start ends', () => {
      beforeEach(() => {
        _clearAppStartEndData();
      });

      it('reports the waiting tasks with the phase when the app start ends', () => {
        setup();
        advanceTo(1_000);
        observer().emitEntries({ startTime: 500, duration: 300 });

        expect(beforeSendMetric).not.toHaveBeenCalled();

        advanceTo(2_000);
        _setAppStartEndData({ timestampMs: START_MS + 2_000, endFrames: null });

        expect(metricAttributes()).toEqual([expect.objectContaining({ 'app.start_phase': 'app_start' })]);
      });

      it('reports the waiting tasks without the phase after the deadline', () => {
        jest.useFakeTimers({ doNotFake: ['Date', 'performance'] });
        setup();
        observer().emitEntries({ startTime: 0, duration: 300 });

        jest.advanceTimersByTime(30_000);
        observer().emitEntries({ startTime: 100, duration: 300 });

        expect(metricAttributes()).toEqual([
          expect.not.objectContaining({ 'app.start_phase': expect.anything() }),
          expect.not.objectContaining({ 'app.start_phase': expect.anything() }),
        ]);
      });

      it('reports the oldest waiting task without the phase when more than 50 tasks wait', () => {
        setup();
        observer().emitEntries(...Array.from({ length: 51 }, (_, index) => ({ startTime: index, duration: 300 })));

        expect(beforeSendMetric).toHaveBeenCalledTimes(1);
        expect(metricAttributes()[0]).not.toHaveProperty('app.start_phase');
      });

      it('reports the waiting tasks when the client closes', async () => {
        setup();
        observer().emitEntries({ startTime: 0, duration: 300 });

        await getClient()?.close();

        expect(beforeSendMetric).toHaveBeenCalledTimes(1);
      });
    });
  });

  it('disconnects the observer when the client closes', async () => {
    setup();

    await getClient()?.close();

    expect(FakePerformanceObserver.instances[0]?.disconnect).toHaveBeenCalledTimes(1);
  });
});
