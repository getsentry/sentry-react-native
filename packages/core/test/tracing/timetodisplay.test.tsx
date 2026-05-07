import type { Event, Measurements, Span, SpanJSON } from '@sentry/core';

import {
  debug,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  setCurrentClient,
  spanToJSON,
  startSpanManual,
} from '@sentry/core';

jest.spyOn(debug, 'warn');

import * as mockWrapper from '../mockWrapper';

jest.mock('../../src/js/wrapper', () => mockWrapper);

import * as mockedtimetodisplaynative from './mockedtimetodisplaynative';

jest.mock('../../src/js/tracing/timetodisplaynative', () => mockedtimetodisplaynative);

import { act, render } from '@testing-library/react-native';
import * as React from 'react';

import { timeToDisplayIntegration } from '../../src/js/tracing/integrations/timeToDisplayIntegration';
import { _resetTimeToDisplayCoordinator } from '../../src/js/tracing/timeToDisplayCoordinator';
import { SPAN_ORIGIN_MANUAL_UI_TIME_TO_DISPLAY } from '../../src/js/tracing/origin';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
} from '../../src/js/tracing/semanticAttributes';
import { SPAN_THREAD_NAME, SPAN_THREAD_NAME_JAVASCRIPT } from '../../src/js/tracing/span';
import {
  startTimeToFullDisplaySpan,
  startTimeToInitialDisplaySpan,
  TimeToFullDisplay,
  TimeToInitialDisplay,
  updateInitialDisplaySpan,
} from '../../src/js/tracing/timetodisplay';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';
import { nowInSeconds, secondAgoTimestampMs, secondInFutureTimestampMs } from '../testutils';

jest.mock('../../src/js/utils/environment', () => ({
  isWeb: jest.fn().mockReturnValue(false),
  isTurboModuleEnabled: jest.fn().mockReturnValue(false),
}));

const { mockRecordedTimeToDisplay, getMockedOnDrawReportedProps, clearMockedOnDrawReportedProps } =
  mockedtimetodisplaynative;

/** Flush the coordinator's deferred up-flip + any consequent React re-renders. */
function flushReadyDefer(): void {
  act(() => {
    jest.runOnlyPendingTimers();
  });
}

/**
 * The mock records every render of every native draw reporter. We slice the
 * tail of the prop log to inspect the converged post-effect state of all
 * currently-mounted reporters for a given span.
 */
function tailHasFullDisplay(parentSpanId: string, mountedReporterCount: number): boolean {
  const props = getMockedOnDrawReportedProps().filter(p => p.parentSpanId === parentSpanId);
  return props.slice(-mountedReporterCount).some(p => p.fullDisplay === true);
}

function tailHasInitialDisplay(parentSpanId: string, mountedReporterCount: number): boolean {
  const props = getMockedOnDrawReportedProps().filter(p => p.parentSpanId === parentSpanId);
  return props.slice(-mountedReporterCount).some(p => p.initialDisplay === true);
}

jest.useFakeTimers({
  advanceTimers: true,
  doNotFake: ['performance'], // Keep real performance API
});

describe('TimeToDisplay', () => {
  let client: TestClient;

  beforeEach(() => {
    clearMockedOnDrawReportedProps();
    _resetTimeToDisplayCoordinator();
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();

    const options = getDefaultTestClientOptions({
      tracesSampleRate: 1.0,
    });
    client = new TestClient({
      ...options,
      integrations: [...options.integrations, timeToDisplayIntegration()],
    });
    setCurrentClient(client);
    client.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Ensure mock properties are reset to default values for test isolation
    mockWrapper.NATIVE.enableNative = true;
  });

  test('creates manual initial display', async () => {
    startSpanManual(
      {
        name: 'Root Manual Span',
        startTime: secondAgoTimestampMs(),
      },
      (activeSpan: Span | undefined) => {
        startTimeToInitialDisplaySpan();
        render(<TimeToInitialDisplay record={true} />);
        mockRecordedTimeToDisplay({
          ttid: {
            [spanToJSON(activeSpan).span_id]: nowInSeconds(),
          },
        });

        activeSpan?.end();
      },
    );

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    expectInitialDisplayMeasurementOnSpan(client.event!);
    expectFinishedInitialDisplaySpan(client.event!);
    expect(getMockedOnDrawReportedProps()[0]!.parentSpanId).toEqual(client.event!.contexts!.trace!.span_id);
  });

  test('creates manual full display', async () => {
    startSpanManual(
      {
        name: 'Root Manual Span',
        startTime: secondAgoTimestampMs(),
      },
      (activeSpan: Span | undefined) => {
        startTimeToInitialDisplaySpan();
        startTimeToFullDisplaySpan();

        render(<TimeToInitialDisplay record={true} />);
        render(<TimeToFullDisplay record={true} />);

        mockRecordedTimeToDisplay({
          ttid: {
            [spanToJSON(activeSpan).span_id]: nowInSeconds(),
          },
          ttfd: {
            [spanToJSON(activeSpan).span_id]: nowInSeconds(),
          },
        });

        activeSpan?.end();
      },
    );

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    expectFullDisplayMeasurementOnSpan(client.event!);
    expectFinishedFullDisplaySpan(client.event!);
    expect(getMockedOnDrawReportedProps()[0]!.parentSpanId).toEqual(client.event!.contexts!.trace!.span_id);
    expect(getMockedOnDrawReportedProps()[1]!.parentSpanId).toEqual(client.event!.contexts!.trace!.span_id);
  });

  test('does not create full display when initial display is missing', async () => {
    startSpanManual(
      {
        name: 'Root Manual Span',
        startTime: secondAgoTimestampMs(),
      },
      (activeSpan: Span | undefined) => {
        startTimeToFullDisplaySpan();
        render(<TimeToFullDisplay record={true} />);

        mockRecordedTimeToDisplay({
          ttfd: {
            [spanToJSON(activeSpan).span_id]: nowInSeconds(),
          },
        });

        activeSpan?.end();
      },
    );

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    expectNoInitialDisplayMeasurementOnSpan(client.event!);
    expectNoFullDisplayMeasurementOnSpan(client.event!);

    expectNoTimeToDisplaySpans(client.event!);

    expect(getMockedOnDrawReportedProps()[0]!.parentSpanId).toEqual(client.event!.contexts!.trace!.span_id);
  });

  test('creates initial display for active span without initial display span', async () => {
    startSpanManual(
      {
        name: 'Root Manual Span',
        startTime: secondAgoTimestampMs(),
      },
      (activeSpan: Span | undefined) => {
        render(<TimeToInitialDisplay record={true} />);

        mockRecordedTimeToDisplay({
          ttid: {
            [spanToJSON(activeSpan).span_id]: nowInSeconds(),
          },
        });

        activeSpan?.end();
      },
    );

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    expectInitialDisplayMeasurementOnSpan(client.event!);
    expectFinishedInitialDisplaySpan(client.event!);
    expect(getMockedOnDrawReportedProps()[0]!.parentSpanId).toEqual(client.event!.contexts!.trace!.span_id);
  });

  test('creates full display for active span without full display span', async () => {
    startSpanManual(
      {
        name: 'Root Manual Span',
        startTime: secondAgoTimestampMs(),
      },
      (activeSpan: Span | undefined) => {
        startTimeToInitialDisplaySpan();
        startTimeToFullDisplaySpan();

        render(<TimeToInitialDisplay record={true} />);
        render(<TimeToFullDisplay record={true} />);

        mockRecordedTimeToDisplay({
          ttid: {
            [spanToJSON(activeSpan).span_id]: nowInSeconds(),
          },
          ttfd: {
            [spanToJSON(activeSpan).span_id]: nowInSeconds(),
          },
        });

        activeSpan?.end();
      },
    );

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    expectFullDisplayMeasurementOnSpan(client.event!);
    expectFinishedFullDisplaySpan(client.event!);
    expect(getMockedOnDrawReportedProps()[0]!.parentSpanId).toEqual(client.event!.contexts!.trace!.span_id);
    expect(getMockedOnDrawReportedProps()[1]!.parentSpanId).toEqual(client.event!.contexts!.trace!.span_id);
  });

  test('cancels full display spans longer than 30s', async () => {
    startSpanManual(
      {
        name: 'Root Manual Span',
        startTime: secondAgoTimestampMs(),
      },
      (activeSpan: Span | undefined) => {
        startTimeToInitialDisplaySpan();
        startTimeToFullDisplaySpan();

        render(<TimeToInitialDisplay record={true} />);
        render(<TimeToFullDisplay record={true} />);

        mockRecordedTimeToDisplay({
          ttid: {
            [spanToJSON(activeSpan).span_id]: nowInSeconds(),
          },
          ttfd: {
            [spanToJSON(activeSpan).span_id]: nowInSeconds() + 40,
          },
        });

        activeSpan?.end();
      },
    );

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    expectFinishedInitialDisplaySpan(client.event!);
    expectDeadlineExceededFullDisplaySpan(client.event!);

    expectInitialDisplayMeasurementOnSpan(client.event!);
    expectFullDisplayMeasurementOnSpan(client.event!);
    expect(client.event!.measurements!.time_to_full_display.value).toEqual(
      client.event!.measurements!.time_to_initial_display.value,
    );
  });

  test('full display which ended before initial display is extended to initial display end', async () => {
    const fullDisplayEndTimestampMs = secondInFutureTimestampMs();
    const initialDisplayEndTimestampMs = secondInFutureTimestampMs() + 500;
    startSpanManual(
      {
        name: 'Root Manual Span',
        startTime: secondAgoTimestampMs(),
      },
      (activeSpan: Span | undefined) => {
        startTimeToInitialDisplaySpan();
        startTimeToFullDisplaySpan();

        const timeToDisplayComponent = render(
          <>
            <TimeToInitialDisplay record={false} />
            <TimeToFullDisplay record={true} />
          </>,
        );
        timeToDisplayComponent.update(
          <>
            <TimeToInitialDisplay record={true} />
            <TimeToFullDisplay record={true} />
          </>,
        );

        mockRecordedTimeToDisplay({
          ttfd: {
            [spanToJSON(activeSpan).span_id]: fullDisplayEndTimestampMs / 1_000,
          },
          ttid: {
            [spanToJSON(activeSpan).span_id]: initialDisplayEndTimestampMs / 1_000,
          },
        });

        activeSpan?.end();
      },
    );

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    expectFinishedInitialDisplaySpan(client.event!);
    expectFinishedFullDisplaySpan(client.event!);

    expectInitialDisplayMeasurementOnSpan(client.event!);
    expectFullDisplayMeasurementOnSpan(client.event!);

    expect(getInitialDisplaySpanJSON(client.event!.spans!)!.timestamp).toEqual(initialDisplayEndTimestampMs / 1_000);
    expect(getFullDisplaySpanJSON(client.event!.spans!)!.timestamp).toEqual(initialDisplayEndTimestampMs / 1_000);
  });
});

function getInitialDisplaySpanJSON(spans: SpanJSON[]) {
  return spans.find(s => s.op === 'ui.load.initial_display');
}

function getFullDisplaySpanJSON(spans: SpanJSON[]) {
  return spans.find(s => s.op === 'ui.load.full_display');
}

function expectFinishedInitialDisplaySpan(event: Event) {
  expect(getInitialDisplaySpanJSON(event.spans!)).toEqual(
    expect.objectContaining<Partial<SpanJSON>>({
      data: {
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'ui.load.initial_display',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_MANUAL_UI_TIME_TO_DISPLAY,
        [SPAN_THREAD_NAME]: SPAN_THREAD_NAME_JAVASCRIPT,
      },
      description: 'Time To Initial Display',
      op: 'ui.load.initial_display',
      parent_span_id: event.contexts.trace.span_id,
      start_timestamp: event.start_timestamp,
      status: 'ok',
      timestamp: expect.any(Number),
    }),
  );
}

function expectFinishedFullDisplaySpan(event: Event) {
  expect(getFullDisplaySpanJSON(event.spans!)).toEqual(
    expect.objectContaining<Partial<SpanJSON>>({
      data: {
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'ui.load.full_display',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_MANUAL_UI_TIME_TO_DISPLAY,
        [SPAN_THREAD_NAME]: SPAN_THREAD_NAME_JAVASCRIPT,
      },
      description: 'Time To Full Display',
      op: 'ui.load.full_display',
      parent_span_id: event.contexts.trace.span_id,
      start_timestamp: event.start_timestamp,
      status: 'ok',
      timestamp: expect.any(Number),
    }),
  );
}

function expectDeadlineExceededFullDisplaySpan(event: Event) {
  expect(getFullDisplaySpanJSON(event.spans!)).toEqual(
    expect.objectContaining<Partial<SpanJSON>>({
      data: {
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'ui.load.full_display',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_MANUAL_UI_TIME_TO_DISPLAY,
        [SPAN_THREAD_NAME]: SPAN_THREAD_NAME_JAVASCRIPT,
      },
      description: 'Time To Full Display',
      op: 'ui.load.full_display',
      parent_span_id: event.contexts.trace.span_id,
      start_timestamp: event.start_timestamp,
      status: 'deadline_exceeded',
      timestamp: expect.any(Number),
    }),
  );
}

function expectNoTimeToDisplaySpans(event: Event) {
  expect(event.spans).toEqual(
    expect.not.arrayContaining<SpanJSON[]>([
      expect.objectContaining<Partial<SpanJSON>>({ op: 'ui.load.initial_display' }),
      expect.objectContaining<Partial<SpanJSON>>({ op: 'ui.load.full_display' }),
    ]),
  );
}

function expectInitialDisplayMeasurementOnSpan(event: Event) {
  expect(event.measurements).toEqual(
    expect.objectContaining<Measurements>({
      time_to_initial_display: {
        value: expect.any(Number),
        unit: 'millisecond',
      },
    }),
  );
}

function expectFullDisplayMeasurementOnSpan(event: Event) {
  expect(event.measurements).toEqual(
    expect.objectContaining<Measurements>({
      time_to_full_display: {
        value: expect.any(Number),
        unit: 'millisecond',
      },
    }),
  );
}

function expectNoInitialDisplayMeasurementOnSpan(event: Event) {
  expect(event.measurements).toBeOneOf([
    undefined,
    expect.not.objectContaining<Measurements>({ time_to_initial_display: expect.anything() }),
  ]);
}

function expectNoFullDisplayMeasurementOnSpan(event: Event) {
  expect(event.measurements).toBeOneOf([
    undefined,
    expect.not.objectContaining<Measurements>({ time_to_full_display: expect.anything() }),
  ]);
}

describe('Frame Data', () => {
  let client: TestClient;

  beforeEach(() => {
    clearMockedOnDrawReportedProps();
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();

    const options = getDefaultTestClientOptions({
      tracesSampleRate: 1.0,
    });
    client = new TestClient({
      ...options,
      integrations: [...options.integrations, timeToDisplayIntegration()],
    });
    setCurrentClient(client);
    client.init();

    // Note: jest.clearAllMocks() in afterEach handles this, but we clear explicitly for clarity
    mockWrapper.NATIVE.fetchNativeFrames.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Ensure mock properties are reset to default values for test isolation
    mockWrapper.NATIVE.enableNative = true;
  });

  test('attaches frame data to initial display span', async () => {
    const startFrames = { totalFrames: 100, slowFrames: 2, frozenFrames: 1 };
    const endFrames = { totalFrames: 150, slowFrames: 5, frozenFrames: 2 };

    mockWrapper.NATIVE.fetchNativeFrames.mockResolvedValueOnce(startFrames).mockResolvedValueOnce(endFrames);

    await startSpanManual(
      {
        name: 'Root Manual Span',
        startTime: secondAgoTimestampMs(),
      },
      async (activeSpan: Span | undefined) => {
        const ttidSpan = startTimeToInitialDisplaySpan();
        render(<TimeToInitialDisplay record={true} />);

        // Flush the entire start frame capture promise chain
        // Need multiple awaits because captureStartFramesForSpan -> fetchNativeFramesWithTimeout -> NATIVE.fetchNativeFrames
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        // Simulate native onDraw callback that triggers span end with frame capture
        updateInitialDisplaySpan(nowInSeconds(), { activeSpan, span: ttidSpan });

        // Allow end frame capture + frames delay fetch promise chain to complete
        for (let i = 0; i < 15; i++) {
          await Promise.resolve();
        }

        activeSpan?.end();
      },
    );

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    // Verify frame capture was called twice (start and end)
    expect(mockWrapper.NATIVE.fetchNativeFrames).toHaveBeenCalledTimes(2);

    const ttidSpan = client.event!.spans!.find((span: SpanJSON) => span.op === 'ui.load.initial_display');
    expect(ttidSpan).toBeDefined();

    // Verify frame data is attached (delta: 150-100=50, 5-2=3, 2-1=1)
    expect(ttidSpan!.data).toEqual(
      expect.objectContaining({
        'frames.total': 50,
        'frames.slow': 3,
        'frames.frozen': 1,
      }),
    );
  });

  test('captures frame data for full display span', async () => {
    const startFrames = { totalFrames: 100, slowFrames: 2, frozenFrames: 1 };
    const endFrames = { totalFrames: 200, slowFrames: 8, frozenFrames: 3 };

    mockWrapper.NATIVE.fetchNativeFrames
      .mockResolvedValueOnce(startFrames)
      .mockResolvedValueOnce(startFrames)
      .mockResolvedValueOnce(endFrames)
      .mockResolvedValueOnce(endFrames);

    startSpanManual(
      {
        name: 'Root Manual Span',
        startTime: secondAgoTimestampMs(),
      },
      (activeSpan: Span | undefined) => {
        startTimeToInitialDisplaySpan();
        startTimeToFullDisplaySpan();

        render(<TimeToInitialDisplay record={true} />);
        render(<TimeToFullDisplay record={true} />);
        mockRecordedTimeToDisplay({
          ttid: {
            [spanToJSON(activeSpan).span_id]: nowInSeconds(),
          },
          ttfd: {
            [spanToJSON(activeSpan).span_id]: secondInFutureTimestampMs() / 1000,
          },
        });

        activeSpan?.end();
      },
    );

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    // Verify frame capture was initiated for both spans
    expect(mockWrapper.NATIVE.fetchNativeFrames).toHaveBeenCalled();

    const ttidSpan = client.event!.spans!.find((span: SpanJSON) => span.op === 'ui.load.initial_display');
    const ttfdSpan = client.event!.spans!.find((span: SpanJSON) => span.op === 'ui.load.full_display');
    expect(ttidSpan).toBeDefined();
    expect(ttfdSpan).toBeDefined();

    // Note: This test doesn't manually trigger span end like the previous test,
    // so frame capture is initiated but not completed in the test flow.
  });

  test('does not attach frame data when frames are zero', async () => {
    const frames = { totalFrames: 100, slowFrames: 2, frozenFrames: 1 };

    mockWrapper.NATIVE.fetchNativeFrames.mockResolvedValueOnce(frames).mockResolvedValueOnce(frames); // Same frames = delta of 0

    startSpanManual(
      {
        name: 'Root Manual Span',
        startTime: secondAgoTimestampMs(),
      },
      (activeSpan: Span | undefined) => {
        startTimeToInitialDisplaySpan();
        render(<TimeToInitialDisplay record={true} />);
        mockRecordedTimeToDisplay({
          ttid: {
            [spanToJSON(activeSpan).span_id]: nowInSeconds(),
          },
        });

        activeSpan?.end();
      },
    );

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    const ttidSpan = client.event!.spans!.find((span: SpanJSON) => span.op === 'ui.load.initial_display');
    expect(ttidSpan).toBeDefined();
    expect(ttidSpan!.data).not.toHaveProperty('frames.total');
    expect(ttidSpan!.data).not.toHaveProperty('frames.slow');
    expect(ttidSpan!.data).not.toHaveProperty('frames.frozen');
  });

  test('does not attach frame data when fetchNativeFrames fails', async () => {
    mockWrapper.NATIVE.fetchNativeFrames.mockRejectedValue(new Error('Failed to fetch frames'));

    startSpanManual(
      {
        name: 'Root Manual Span',
        startTime: secondAgoTimestampMs(),
      },
      (activeSpan: Span | undefined) => {
        startTimeToInitialDisplaySpan();
        render(<TimeToInitialDisplay record={true} />);
        mockRecordedTimeToDisplay({
          ttid: {
            [spanToJSON(activeSpan).span_id]: nowInSeconds(),
          },
        });

        activeSpan?.end();
      },
    );

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    const ttidSpan = client.event!.spans!.find((span: SpanJSON) => span.op === 'ui.load.initial_display');
    expect(ttidSpan).toBeDefined();
    expect(ttidSpan!.data).not.toHaveProperty('frames.total');
    expect(ttidSpan!.data).not.toHaveProperty('frames.slow');
    expect(ttidSpan!.data).not.toHaveProperty('frames.frozen');
  });

  test('does not attach frame data when native is disabled', async () => {
    mockWrapper.NATIVE.enableNative = false;

    startSpanManual(
      {
        name: 'Root Manual Span',
        startTime: secondAgoTimestampMs(),
      },
      (activeSpan: Span | undefined) => {
        startTimeToInitialDisplaySpan();
        render(<TimeToInitialDisplay record={true} />);
        mockRecordedTimeToDisplay({
          ttid: {
            [spanToJSON(activeSpan).span_id]: nowInSeconds(),
          },
        });

        activeSpan?.end();
      },
    );

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    const ttidSpan = client.event!.spans!.find((span: SpanJSON) => span.op === 'ui.load.initial_display');
    expect(ttidSpan).toBeDefined();
    expect(ttidSpan!.data).not.toHaveProperty('frames.total');
    expect(ttidSpan!.data).not.toHaveProperty('frames.slow');
    expect(ttidSpan!.data).not.toHaveProperty('frames.frozen');

    // Note: Reset happens in afterEach, not here
  });

  test('attaches frames.delay to initial display span', async () => {
    const startFrames = { totalFrames: 100, slowFrames: 2, frozenFrames: 1 };
    const endFrames = { totalFrames: 150, slowFrames: 5, frozenFrames: 2 };

    mockWrapper.NATIVE.fetchNativeFrames.mockResolvedValueOnce(startFrames).mockResolvedValueOnce(endFrames);
    mockWrapper.NATIVE.fetchNativeFramesDelay.mockResolvedValue(0.1234);

    await startSpanManual(
      {
        name: 'Root Manual Span',
        startTime: secondAgoTimestampMs(),
      },
      async (activeSpan: Span | undefined) => {
        const ttidSpan = startTimeToInitialDisplaySpan();
        render(<TimeToInitialDisplay record={true} />);

        // Flush start frame capture
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        updateInitialDisplaySpan(nowInSeconds(), { activeSpan, span: ttidSpan });

        // Flush end frame capture + frames delay fetch
        // The async chain is: fetchNativeFramesWithTimeout -> attachFrameDataToSpan -> fetchNativeFramesDelay
        // Each step requires multiple microtask ticks to resolve
        for (let i = 0; i < 15; i++) {
          await Promise.resolve();
        }

        activeSpan?.end();
      },
    );

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    const ttidSpan = client.event!.spans!.find((span: SpanJSON) => span.op === 'ui.load.initial_display');
    expect(ttidSpan).toBeDefined();
    expect(ttidSpan!.data).toEqual(
      expect.objectContaining({
        'frames.delay': 0.1234,
      }),
    );
  });

  test('does not attach frames.delay when native returns null', async () => {
    const startFrames = { totalFrames: 100, slowFrames: 2, frozenFrames: 1 };
    const endFrames = { totalFrames: 150, slowFrames: 5, frozenFrames: 2 };

    mockWrapper.NATIVE.fetchNativeFrames.mockResolvedValueOnce(startFrames).mockResolvedValueOnce(endFrames);
    mockWrapper.NATIVE.fetchNativeFramesDelay.mockResolvedValue(null);

    await startSpanManual(
      {
        name: 'Root Manual Span',
        startTime: secondAgoTimestampMs(),
      },
      async (activeSpan: Span | undefined) => {
        const ttidSpan = startTimeToInitialDisplaySpan();
        render(<TimeToInitialDisplay record={true} />);

        // Flush start frame capture
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        updateInitialDisplaySpan(nowInSeconds(), { activeSpan, span: ttidSpan });

        // Flush end frame capture + frames delay fetch
        for (let i = 0; i < 10; i++) {
          await Promise.resolve();
        }

        activeSpan?.end();
      },
    );

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    const ttidSpan = client.event!.spans!.find((span: SpanJSON) => span.op === 'ui.load.initial_display');
    expect(ttidSpan).toBeDefined();
    expect(ttidSpan!.data).not.toHaveProperty('frames.delay');
  });

  describe('multi-instance (`ready` prop)', () => {
    test('legacy: single `record` instance behaves identically to today', () => {
      startSpanManual({ name: 'Screen', startTime: secondAgoTimestampMs() }, (activeSpan: Span | undefined) => {
        const spanId = spanToJSON(activeSpan!).span_id;
        render(<TimeToFullDisplay record={true} />);
        flushReadyDefer();
        expect(tailHasFullDisplay(spanId, 1)).toBe(true);
        activeSpan?.end();
      });
    });

    test('two `ready={false}` instances do not emit', () => {
      startSpanManual({ name: 'Screen', startTime: secondAgoTimestampMs() }, (activeSpan: Span | undefined) => {
        const spanId = spanToJSON(activeSpan!).span_id;
        render(
          <>
            <TimeToFullDisplay ready={false} />
            <TimeToFullDisplay ready={false} />
          </>,
        );
        flushReadyDefer();
        expect(tailHasFullDisplay(spanId, 2)).toBe(false);
        activeSpan?.end();
      });
    });

    test('two `ready` instances emit only when both are ready', () => {
      startSpanManual({ name: 'Screen', startTime: secondAgoTimestampMs() }, (activeSpan: Span | undefined) => {
        const spanId = spanToJSON(activeSpan!).span_id;

        const Screen = ({ a, b }: { a: boolean; b: boolean }) => (
          <>
            <TimeToFullDisplay ready={a} />
            <TimeToFullDisplay ready={b} />
          </>
        );

        const tree = render(<Screen a={false} b={false} />);
        flushReadyDefer();
        expect(tailHasFullDisplay(spanId, 2)).toBe(false);

        act(() => tree.rerender(<Screen a={true} b={false} />));
        flushReadyDefer();
        expect(tailHasFullDisplay(spanId, 2)).toBe(false);

        act(() => tree.rerender(<Screen a={true} b={true} />));
        flushReadyDefer();
        expect(tailHasFullDisplay(spanId, 2)).toBe(true);

        activeSpan?.end();
      });
    });

    test('late-mounting `ready={false}` un-readies an already-ready aggregate', () => {
      startSpanManual({ name: 'Screen', startTime: secondAgoTimestampMs() }, (activeSpan: Span | undefined) => {
        const spanId = spanToJSON(activeSpan!).span_id;

        const Screen = ({ showLate, lateReady }: { showLate: boolean; lateReady: boolean }) => (
          <>
            <TimeToFullDisplay ready={true} />
            {showLate ? <TimeToFullDisplay ready={lateReady} /> : null}
          </>
        );

        const tree = render(<Screen showLate={false} lateReady={false} />);
        flushReadyDefer();
        expect(tailHasFullDisplay(spanId, 1)).toBe(true);

        act(() => tree.rerender(<Screen showLate={true} lateReady={false} />));
        flushReadyDefer();
        expect(tailHasFullDisplay(spanId, 2)).toBe(false);

        act(() => tree.rerender(<Screen showLate={true} lateReady={true} />));
        flushReadyDefer();
        expect(tailHasFullDisplay(spanId, 2)).toBe(true);

        activeSpan?.end();
      });
    });

    test('unmounting the sole blocker does NOT emit ready (sticky safeguard)', () => {
      // A conditionally-rendered loading section that disappears before its
      // data resolves must not trick TTFD into firing as if the screen were
      // fully displayed. The sole-blocker checkpoint is kept sticky in the
      // registry, so its unmount cannot flip the aggregate to true.
      startSpanManual({ name: 'Screen', startTime: secondAgoTimestampMs() }, (activeSpan: Span | undefined) => {
        const spanId = spanToJSON(activeSpan!).span_id;

        const Screen = ({ showBlocker }: { showBlocker: boolean }) => (
          <>
            <TimeToFullDisplay ready={true} />
            {showBlocker ? <TimeToFullDisplay ready={false} /> : null}
          </>
        );

        const tree = render(<Screen showBlocker={true} />);
        flushReadyDefer();
        expect(tailHasFullDisplay(spanId, 2)).toBe(false);

        act(() => tree.rerender(<Screen showBlocker={false} />));
        flushReadyDefer();
        expect(tailHasFullDisplay(spanId, 1)).toBe(false);

        activeSpan?.end();
      });
    });

    test('unmounting a non-sole-blocker resolves the aggregate when remaining peers are ready', () => {
      // The sticky safeguard only applies to *sole* blockers. If other
      // not-ready peers exist, an unmount can't flip the aggregate to true,
      // so it removes normally.
      startSpanManual({ name: 'Screen', startTime: secondAgoTimestampMs() }, (activeSpan: Span | undefined) => {
        const spanId = spanToJSON(activeSpan!).span_id;

        const Screen = ({ aReady, showB }: { aReady: boolean; showB: boolean }) => (
          <>
            <TimeToFullDisplay ready={aReady} />
            {showB ? <TimeToFullDisplay ready={false} /> : null}
          </>
        );

        const tree = render(<Screen aReady={false} showB={true} />);
        flushReadyDefer();
        expect(tailHasFullDisplay(spanId, 2)).toBe(false);

        act(() => tree.rerender(<Screen aReady={false} showB={false} />));
        flushReadyDefer();
        expect(tailHasFullDisplay(spanId, 1)).toBe(false);

        act(() => tree.rerender(<Screen aReady={true} showB={false} />));
        flushReadyDefer();
        expect(tailHasFullDisplay(spanId, 1)).toBe(true);

        activeSpan?.end();
      });
    });

    test('mixed `record` + `ready`: legacy `record` is independent, `ready` peers coordinate', () => {
      // Backward compat: `record`-only instances do not register as checkpoints
      // and are not gated by `ready` peers.
      startSpanManual({ name: 'Screen', startTime: secondAgoTimestampMs() }, (activeSpan: Span | undefined) => {
        const spanId = spanToJSON(activeSpan!).span_id;

        const Screen = ({ rec, rdy }: { rec: boolean; rdy: boolean }) => (
          <>
            <TimeToFullDisplay record={rec} />
            <TimeToFullDisplay ready={rdy} />
          </>
        );

        const tree = render(<Screen rec={true} rdy={false} />);
        flushReadyDefer();
        expect(tailHasFullDisplay(spanId, 2)).toBe(true);

        act(() => tree.rerender(<Screen rec={false} rdy={true} />));
        flushReadyDefer();
        expect(tailHasFullDisplay(spanId, 2)).toBe(true);

        act(() => tree.rerender(<Screen rec={true} rdy={true} />));
        flushReadyDefer();
        expect(tailHasFullDisplay(spanId, 2)).toBe(true);

        activeSpan?.end();
      });
    });

    test('legacy: bare <TimeToFullDisplay /> does not block `ready` peers', () => {
      // Backward compat for layout-placeholder usage. A bare component is a no-op.
      startSpanManual({ name: 'Screen', startTime: secondAgoTimestampMs() }, (activeSpan: Span | undefined) => {
        const spanId = spanToJSON(activeSpan!).span_id;
        render(
          <>
            <TimeToFullDisplay />
            <TimeToFullDisplay ready={true} />
          </>,
        );
        flushReadyDefer();
        expect(tailHasFullDisplay(spanId, 2)).toBe(true);
        activeSpan?.end();
      });
    });

    test('legacy: two `record` peers fire independently (no coordination)', () => {
      // Pre-change behavior was last-write-wins on the native side. record-only
      // peers must continue to fire independently.
      startSpanManual({ name: 'Screen', startTime: secondAgoTimestampMs() }, (activeSpan: Span | undefined) => {
        const spanId = spanToJSON(activeSpan!).span_id;
        render(
          <>
            <TimeToFullDisplay record={true} />
            <TimeToFullDisplay record={false} />
          </>,
        );
        flushReadyDefer();
        expect(tailHasFullDisplay(spanId, 2)).toBe(true);
        activeSpan?.end();
      });
    });

    test('late-mounting `ready={false}` peer does not inherit existing peer\u2019s ready=true (pre-register clamp)', () => {
      // A fresh component on its first render calls isAllReady before its
      // useEffect has registered. The clamp `localReady && isAllReady` ensures
      // it can never inherit a peer's true verdict on its first render.
      startSpanManual({ name: 'Screen', startTime: secondAgoTimestampMs() }, (activeSpan: Span | undefined) => {
        const spanId = spanToJSON(activeSpan!).span_id;

        const Screen = ({ showLate }: { showLate: boolean }) => (
          <>
            <TimeToFullDisplay ready={true} />
            {showLate ? <TimeToFullDisplay ready={false} /> : null}
          </>
        );

        const tree = render(<Screen showLate={false} />);
        flushReadyDefer();
        expect(tailHasFullDisplay(spanId, 1)).toBe(true);

        act(() => tree.rerender(<Screen showLate={true} />));
        flushReadyDefer();
        expect(tailHasFullDisplay(spanId, 2)).toBe(false);

        activeSpan?.end();
      });
    });

    test('same-task wave: header alone-and-ready does not fire when sibling mounts on next commit', () => {
      // The defining race the deferred up-flip protects against: header
      // registers ready=true alone, sibling mounts a tick later via the typical
      // parent-useEffect-setState wave. setTimeout(0) defers past the entire
      // task so the late mount cancels the pending up-flip.
      startSpanManual({ name: 'Screen', startTime: secondAgoTimestampMs() }, (activeSpan: Span | undefined) => {
        const spanId = spanToJSON(activeSpan!).span_id;

        const Screen = (): React.ReactElement => {
          const [showSidebar, setShowSidebar] = React.useState(false);
          React.useEffect(() => {
            setShowSidebar(true);
          }, []);
          return (
            <>
              <TimeToFullDisplay ready={true} />
              {showSidebar ? <TimeToFullDisplay ready={false} /> : null}
            </>
          );
        };

        render(<Screen />);
        flushReadyDefer();
        expect(tailHasFullDisplay(spanId, 2)).toBe(false);

        activeSpan?.end();
      });
    });

    test('different active spans have independent registries', () => {
      let firstSpanId = '';
      let secondSpanId = '';

      startSpanManual({ name: 'Screen A', startTime: secondAgoTimestampMs() }, (activeSpan: Span | undefined) => {
        firstSpanId = spanToJSON(activeSpan!).span_id;
        render(<TimeToFullDisplay ready={true} />);
        activeSpan?.end();
      });

      clearMockedOnDrawReportedProps();

      startSpanManual({ name: 'Screen B', startTime: secondAgoTimestampMs() }, (activeSpan: Span | undefined) => {
        secondSpanId = spanToJSON(activeSpan!).span_id;
        render(<TimeToFullDisplay ready={false} />);
        flushReadyDefer();
        expect(tailHasFullDisplay(secondSpanId, 1)).toBe(false);
        activeSpan?.end();
      });

      expect(firstSpanId).not.toEqual(secondSpanId);
    });

    test('TTID `ready` aggregates symmetrically', () => {
      startSpanManual({ name: 'Screen', startTime: secondAgoTimestampMs() }, (activeSpan: Span | undefined) => {
        const spanId = spanToJSON(activeSpan!).span_id;

        const Screen = ({ a, b }: { a: boolean; b: boolean }) => (
          <>
            <TimeToInitialDisplay ready={a} />
            <TimeToInitialDisplay ready={b} />
          </>
        );

        const tree = render(<Screen a={false} b={true} />);
        flushReadyDefer();
        expect(tailHasInitialDisplay(spanId, 2)).toBe(false);

        act(() => tree.rerender(<Screen a={true} b={true} />));
        flushReadyDefer();
        expect(tailHasInitialDisplay(spanId, 2)).toBe(true);

        activeSpan?.end();
      });
    });
  });
});
