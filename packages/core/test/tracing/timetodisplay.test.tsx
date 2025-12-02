import type { Event, Measurements, Span, SpanJSON } from '@sentry/core';
import { debug , getCurrentScope, getGlobalScope, getIsolationScope, setCurrentClient, spanToJSON, startSpanManual } from '@sentry/core';

jest.spyOn(debug, 'warn');

import * as mockWrapper from '../mockWrapper';

jest.mock('../../src/js/wrapper', () => mockWrapper);

import * as mockedtimetodisplaynative from './mockedtimetodisplaynative';

jest.mock('../../src/js/tracing/timetodisplaynative', () => mockedtimetodisplaynative);

import { render } from '@testing-library/react-native';
import * as React from 'react';
import { timeToDisplayIntegration } from '../../src/js/tracing/integrations/timeToDisplayIntegration';
import { SPAN_ORIGIN_MANUAL_UI_TIME_TO_DISPLAY } from '../../src/js/tracing/origin';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../src/js/tracing/semanticAttributes';
import { SPAN_THREAD_NAME , SPAN_THREAD_NAME_JAVASCRIPT } from '../../src/js/tracing/span';
import { startTimeToFullDisplaySpan, startTimeToInitialDisplaySpan, TimeToFullDisplay, TimeToInitialDisplay, updateInitialDisplaySpan } from '../../src/js/tracing/timetodisplay';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';
import { nowInSeconds, secondAgoTimestampMs, secondInFutureTimestampMs } from '../testutils';

jest.mock('../../src/js/utils/environment', () => ({
  isWeb: jest.fn().mockReturnValue(false),
  isTurboModuleEnabled: jest.fn().mockReturnValue(false),
}));

const { mockRecordedTimeToDisplay, getMockedOnDrawReportedProps, clearMockedOnDrawReportedProps } = mockedtimetodisplaynative;

jest.useFakeTimers({
  advanceTimers: true,
  doNotFake: ['performance'] // Keep real performance API
});

describe('TimeToDisplay', () => {
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
      integrations: [
        ...options.integrations,
        timeToDisplayIntegration(),
      ],
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
    expect(client.event!.measurements!.time_to_full_display.value)
      .toEqual(client.event!.measurements!.time_to_initial_display.value);
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

        const timeToDisplayComponent = render(<><TimeToInitialDisplay record={false} /><TimeToFullDisplay record={true}/></>);
        timeToDisplayComponent.update(<><TimeToInitialDisplay record={true} /><TimeToFullDisplay record={true}/></>);

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
  expect(getInitialDisplaySpanJSON(event.spans!)).toEqual(expect.objectContaining<Partial<SpanJSON>>({
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
  }));
}

function expectFinishedFullDisplaySpan(event: Event) {
  expect(getFullDisplaySpanJSON(event.spans!)).toEqual(expect.objectContaining<Partial<SpanJSON>>({
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
  }));
}


function expectDeadlineExceededFullDisplaySpan(event: Event) {
  expect(getFullDisplaySpanJSON(event.spans!)).toEqual(expect.objectContaining<Partial<SpanJSON>>({
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
  }));
}

function expectNoTimeToDisplaySpans(event: Event) {
  expect(event.spans).toEqual(expect.not.arrayContaining<SpanJSON[]>([
    expect.objectContaining<Partial<SpanJSON>>({ op: 'ui.load.initial_display' }),
    expect.objectContaining<Partial<SpanJSON>>({ op: 'ui.load.full_display' }),
  ]));
}

function expectInitialDisplayMeasurementOnSpan(event: Event) {
  expect(event.measurements).toEqual(expect.objectContaining<Measurements>({
    time_to_initial_display: {
      value: expect.any(Number),
      unit: 'millisecond',
    },
  }));
}

function expectFullDisplayMeasurementOnSpan(event: Event) {
  expect(event.measurements).toEqual(expect.objectContaining<Measurements>({
    time_to_full_display: {
      value: expect.any(Number),
      unit: 'millisecond',
    },
  }));
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
      integrations: [
        ...options.integrations,
        timeToDisplayIntegration(),
      ],
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

    mockWrapper.NATIVE.fetchNativeFrames
      .mockResolvedValueOnce(startFrames)
      .mockResolvedValueOnce(endFrames);

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

        // Allow end frame capture promise chain to complete
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

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

    mockWrapper.NATIVE.fetchNativeFrames
      .mockResolvedValueOnce(frames)
      .mockResolvedValueOnce(frames); // Same frames = delta of 0

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
});
