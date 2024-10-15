import { logger } from '@sentry/utils';
jest.spyOn(logger, 'warn');

import * as mockedtimetodisplaynative from './mockedtimetodisplaynative';
jest.mock('../../src/js/tracing/timetodisplaynative', () => mockedtimetodisplaynative);

import { isTurboModuleEnabled } from '../../src/js/utils/environment';
jest.mock('../../src/js/utils/environment', () => ({
  isTurboModuleEnabled: jest.fn().mockReturnValue(false),
}));

import { getActiveSpan, getCurrentScope, getGlobalScope, getIsolationScope, getSpanDescendants, setCurrentClient, spanToJSON, startSpanManual} from '@sentry/core';
import type { Event, Measurements, Span, SpanJSON} from '@sentry/types';
import * as React from "react";
import * as TestRenderer from 'react-test-renderer';

import { SPAN_ORIGIN_MANUAL_UI_TIME_TO_DISPLAY } from '../../src/js/tracing/origin';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../src/js/tracing/semanticAttributes';
import { startTimeToFullDisplaySpan, startTimeToInitialDisplaySpan, TimeToFullDisplay, TimeToInitialDisplay } from '../../src/js/tracing/timetodisplay';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';
import { secondAgoTimestampMs, secondInFutureTimestampMs } from '../testutils';
import { emitNativeFullDisplayEvent, emitNativeInitialDisplayEvent } from './mockedtimetodisplaynative';

jest.useFakeTimers({advanceTimers: true});

describe('TimeToDisplay', () => {
  let client: TestClient;

  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();

    const options = getDefaultTestClientOptions({
      tracesSampleRate: 1.0,
    });
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('creates manual initial display', async () => {
    const [testSpan, activeSpan] = startSpanManual(
      {
        name: 'Root Manual Span',
        startTime: secondAgoTimestampMs(),
      },
       (activeSpan: Span | undefined) => {
        const testSpan = startTimeToInitialDisplaySpan();
        TestRenderer.create(<TimeToInitialDisplay record={true} />);

        emitNativeInitialDisplayEvent();

        activeSpan?.end();

        return [testSpan, activeSpan];
      },
    );

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    expectInitialDisplayMeasurementOnSpan(client.event!);
    expectFinishedInitialDisplaySpan(testSpan, activeSpan);
    expect(spanToJSON(testSpan!).start_timestamp).toEqual(spanToJSON(activeSpan!).start_timestamp);
  });

  test('creates manual full display', async () => {
    const [testSpan, activeSpan] = startSpanManual(
      {
        name: 'Root Manual Span',
        startTime: secondAgoTimestampMs(),
      },
      (activeSpan: Span | undefined) => {
        startTimeToInitialDisplaySpan();
        const testSpan = startTimeToFullDisplaySpan();

        TestRenderer.create(<TimeToInitialDisplay record={true} />);
        emitNativeInitialDisplayEvent();

        TestRenderer.create(<TimeToFullDisplay record={true} />);
        emitNativeFullDisplayEvent();

        activeSpan?.end();
        return [testSpan, activeSpan];
      },
    );

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    expectFullDisplayMeasurementOnSpan(client.event!);
    expectFinishedFullDisplaySpan(testSpan, activeSpan);
    expect(spanToJSON(testSpan!).start_timestamp).toEqual(spanToJSON(activeSpan!).start_timestamp);
  });

  test('creates initial display span on first component render', async () => {
    const [testSpan, activeSpan] = startSpanManual(
      {
        name: 'Root Manual Span',
        startTime: secondAgoTimestampMs(),
      },
       (activeSpan: Span | undefined) => {
        const renderer = TestRenderer.create(<TimeToInitialDisplay record={false} />);
        const testSpan = getInitialDisplaySpan(activeSpan);

        renderer.update(<TimeToInitialDisplay record={true} />);
        emitNativeInitialDisplayEvent();

        activeSpan?.end();
        return [testSpan, activeSpan];
      },
    );

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    expectInitialDisplayMeasurementOnSpan(client.event!);
    expectFinishedInitialDisplaySpan(testSpan, activeSpan);
    expect(spanToJSON(testSpan!).start_timestamp).toEqual(spanToJSON(activeSpan!).start_timestamp);
  });

  test('creates full display span on first component render', async () => {
    const [testSpan, activeSpan] = startSpanManual(
      {
        name: 'Root Manual Span',
        startTime: secondAgoTimestampMs(),
      },
      (activeSpan: Span | undefined) => {
        TestRenderer.create(<TimeToInitialDisplay record={true} />);
        emitNativeInitialDisplayEvent();

        const renderer = TestRenderer.create(<TimeToFullDisplay record={false} />);
        const testSpan = getFullDisplaySpan(getActiveSpan());

        renderer.update(<TimeToFullDisplay record={true} />);
        emitNativeFullDisplayEvent();

        activeSpan?.end();
        return [testSpan, activeSpan];
      },
    );

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    expectFullDisplayMeasurementOnSpan(client.event!);
    expectFinishedFullDisplaySpan(testSpan, activeSpan);
    expect(spanToJSON(testSpan!).start_timestamp).toEqual(spanToJSON(activeSpan!).start_timestamp);
  });

  test('does not create full display when initial display is missing', async () => {
    const [activeSpan] = startSpanManual(
      {
        name: 'Root Manual Span',
        startTime: secondAgoTimestampMs(),
      },
      (activeSpan: Span | undefined) => {
        startTimeToFullDisplaySpan();
        TestRenderer.create(<TimeToFullDisplay record={true} />);

        emitNativeFullDisplayEvent();

        activeSpan?.end();
        return [activeSpan];
      },
    );

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    expectNoInitialDisplayMeasurementOnSpan(client.event!);
    expectNoFullDisplayMeasurementOnSpan(client.event!);

    expectNoTimeToDisplaySpans(activeSpan);
  });

  test('creates initial display for active span without initial display span', async () => {
    const [activeSpan] = startSpanManual(
      {
        name: 'Root Manual Span',
        startTime: secondAgoTimestampMs(),
      },
      (activeSpan: Span | undefined) => {
        TestRenderer.create(<TimeToInitialDisplay record={true} />);

        emitNativeInitialDisplayEvent();

        activeSpan?.end();
        return [activeSpan];
      },
    );

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    expectInitialDisplayMeasurementOnSpan(client.event!);
    expectFinishedInitialDisplaySpan(getInitialDisplaySpan(activeSpan), activeSpan);
  });

  test('creates full display for active span without full display span', async () => {
    const [activeSpan] = startSpanManual(
      {
        name: 'Root Manual Span',
        startTime: secondAgoTimestampMs(),
      },
      (activeSpan: Span | undefined) => {
        startTimeToInitialDisplaySpan();
        startTimeToFullDisplaySpan();

        TestRenderer.create(<TimeToInitialDisplay record={true} />);
        emitNativeInitialDisplayEvent();

        TestRenderer.create(<TimeToFullDisplay record={true} />);
        emitNativeFullDisplayEvent();

        activeSpan?.end();
        return [activeSpan];
      },
    );

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    expectFullDisplayMeasurementOnSpan(client.event!);
    expectFinishedFullDisplaySpan(getFullDisplaySpan(activeSpan), activeSpan);
  });

  test('cancels full display spans longer than 30s', async () => {
    const [activeSpan] = startSpanManual(
      {
        name: 'Root Manual Span',
        startTime: secondAgoTimestampMs(),
      },
      (activeSpan: Span | undefined) => {
        startTimeToInitialDisplaySpan();
        startTimeToFullDisplaySpan();

        TestRenderer.create(<TimeToInitialDisplay record={true} />);
        emitNativeInitialDisplayEvent();

        TestRenderer.create(<TimeToFullDisplay record={true} />);
        // native event is not emitted

        jest.advanceTimersByTime(40_000);

        activeSpan?.end();
        return [activeSpan];
      },
    );

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    expectFinishedInitialDisplaySpan(getInitialDisplaySpan(activeSpan), activeSpan);
    expectDeadlineExceededFullDisplaySpan(getFullDisplaySpan(activeSpan), activeSpan);

    expectInitialDisplayMeasurementOnSpan(client.event!);
    expectFullDisplayMeasurementOnSpan(client.event!);
    expect(client.event!.measurements!.time_to_full_display.value)
      .toEqual(client.event!.measurements!.time_to_initial_display.value);
  });

  test('full display which ended before initial display is extended to initial display end', async () => {
    const fullDisplayEndTimestampMs = secondInFutureTimestampMs();
    const initialDisplayEndTimestampMs = secondInFutureTimestampMs() + 500;
    const [initialDisplaySpan, fullDisplaySpan, activeSpan] = startSpanManual(
      {
        name: 'Root Manual Span',
        startTime: secondAgoTimestampMs(),
      },
      (activeSpan: Span | undefined) => {
        const initialDisplaySpan = startTimeToInitialDisplaySpan();
        const fullDisplaySpan = startTimeToFullDisplaySpan();

        const timeToDisplayComponent = TestRenderer.create(<><TimeToInitialDisplay record={false} /><TimeToFullDisplay record={true}/></>);
        emitNativeFullDisplayEvent(fullDisplayEndTimestampMs);

        timeToDisplayComponent.update(<><TimeToInitialDisplay record={true} /><TimeToFullDisplay record={true}/></>);
        emitNativeFullDisplayEvent(fullDisplayEndTimestampMs + 10);
        emitNativeInitialDisplayEvent(initialDisplayEndTimestampMs);

        activeSpan?.end();
        return [initialDisplaySpan, fullDisplaySpan, activeSpan];
      },
    );

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    expectFinishedInitialDisplaySpan(initialDisplaySpan, activeSpan);
    expectFinishedFullDisplaySpan(fullDisplaySpan, activeSpan);

    expectInitialDisplayMeasurementOnSpan(client.event!);
    expectFullDisplayMeasurementOnSpan(client.event!);

    expect(spanToJSON(initialDisplaySpan!).timestamp).toEqual(initialDisplayEndTimestampMs / 1_000);
    expect(spanToJSON(fullDisplaySpan!).timestamp).toEqual(initialDisplayEndTimestampMs / 1_000);
  });

  test('full display which ended before but processed after initial display is extended to initial display end', async () => {
    const fullDisplayEndTimestampMs = secondInFutureTimestampMs();
    const initialDisplayEndTimestampMs = secondInFutureTimestampMs() + 500;
    const [initialDisplaySpan, fullDisplaySpan, activeSpan] = startSpanManual(
      {
        name: 'Root Manual Span',
        startTime: secondAgoTimestampMs(),
      },
      (activeSpan: Span | undefined) => {
        const initialDisplaySpan = startTimeToInitialDisplaySpan();
        const fullDisplaySpan = startTimeToFullDisplaySpan();

        const timeToDisplayComponent = TestRenderer.create(<><TimeToInitialDisplay record={false} /><TimeToFullDisplay record={true}/></>);
        timeToDisplayComponent.update(<><TimeToInitialDisplay record={true} /><TimeToFullDisplay record={true} /></>);

        emitNativeInitialDisplayEvent(initialDisplayEndTimestampMs);
        emitNativeFullDisplayEvent(fullDisplayEndTimestampMs);

        activeSpan?.end();
        return [initialDisplaySpan, fullDisplaySpan, activeSpan];
      },
    );

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    expectFinishedInitialDisplaySpan(initialDisplaySpan, activeSpan);
    expectFinishedFullDisplaySpan(fullDisplaySpan, activeSpan);

    expectInitialDisplayMeasurementOnSpan(client.event!);
    expectFullDisplayMeasurementOnSpan(client.event!);

    expect(spanToJSON(initialDisplaySpan!).timestamp).toEqual(initialDisplayEndTimestampMs / 1_000);
    expect(spanToJSON(fullDisplaySpan!).timestamp).toEqual(initialDisplayEndTimestampMs / 1_000);
  });

  test('consequent renders do not update display end', async () => {
    const initialDisplayEndTimestampMs = secondInFutureTimestampMs();
    const fullDisplayEndTimestampMs = secondInFutureTimestampMs() + 500;
    const [initialDisplaySpan, fullDisplaySpan, activeSpan] = startSpanManual(
      {
        name: 'Root Manual Span',
        startTime: secondAgoTimestampMs(),
      },
      (activeSpan: Span | undefined) => {
        const initialDisplaySpan = startTimeToInitialDisplaySpan();
        const fullDisplaySpan = startTimeToFullDisplaySpan();

        const timeToDisplayComponent = TestRenderer.create(<><TimeToInitialDisplay record={true} /><TimeToFullDisplay record={false}/></>);
        emitNativeInitialDisplayEvent(initialDisplayEndTimestampMs);

        timeToDisplayComponent.update(<><TimeToInitialDisplay record={true} /><TimeToFullDisplay record={false}/></>);
        emitNativeInitialDisplayEvent(fullDisplayEndTimestampMs + 10);

        timeToDisplayComponent.update(<><TimeToInitialDisplay record={true} /><TimeToFullDisplay record={true}/></>);
        emitNativeFullDisplayEvent(fullDisplayEndTimestampMs);

        timeToDisplayComponent.update(<><TimeToInitialDisplay record={true} /><TimeToFullDisplay record={true}/></>);
        emitNativeFullDisplayEvent(fullDisplayEndTimestampMs + 20);

        activeSpan?.end();
        return [initialDisplaySpan, fullDisplaySpan, activeSpan];
      },
    );

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    expectFinishedInitialDisplaySpan(initialDisplaySpan, activeSpan);
    expectFinishedFullDisplaySpan(fullDisplaySpan, activeSpan);

    expectInitialDisplayMeasurementOnSpan(client.event!);
    expectFullDisplayMeasurementOnSpan(client.event!);

    expect(spanToJSON(initialDisplaySpan!).timestamp).toEqual(initialDisplayEndTimestampMs / 1_000);
    expect(spanToJSON(fullDisplaySpan!).timestamp).toEqual(fullDisplayEndTimestampMs / 1_000);
  });

  test('should not log a warning if native component exists and not in new architecture', async () => {

    (isTurboModuleEnabled as jest.Mock).mockReturnValue(false);

    TestRenderer.create(<TimeToInitialDisplay record={true} />);
    await jest.runOnlyPendingTimersAsync(); // Flush setTimeout.

    expect(logger.warn).not.toHaveBeenCalled();
  });

  test('should log a warning if in new architecture', async () => {

    (isTurboModuleEnabled as jest.Mock).mockReturnValue(true);
    TestRenderer.create(<TimeToInitialDisplay record={true} />);
    await jest.runOnlyPendingTimersAsync(); // Flush setTimeout.

    expect(logger.warn).toHaveBeenCalledWith(
      'TimeToInitialDisplay and TimeToFullDisplay are not supported on the web, Expo Go and New Architecture. Run native build or report an issue at https://github.com/getsentry/sentry-react-native');
  });
});

function getInitialDisplaySpan(span?: Span) {
  return getSpanDescendants(span!)?.find(s => spanToJSON(s).op === 'ui.load.initial_display');
}

function getFullDisplaySpan(span?: Span) {
  return getSpanDescendants(span!)?.find(s => spanToJSON(s).op === 'ui.load.full_display');
}

function expectFinishedInitialDisplaySpan(actualSpan?: Span, expectedParentSpan?: Span) {
  expect(spanToJSON(actualSpan!)).toEqual(expect.objectContaining<Partial<SpanJSON>>({
    data: {
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: "ui.load.initial_display",
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_MANUAL_UI_TIME_TO_DISPLAY,
    },
    description: 'Time To Initial Display',
    op: 'ui.load.initial_display',
    parent_span_id: expectedParentSpan ? spanToJSON(expectedParentSpan).span_id : undefined,
    start_timestamp: expect.any(Number),
    status: 'ok',
    timestamp: expect.any(Number),
  }));
}

function expectFinishedFullDisplaySpan(actualSpan?: Span, expectedParentSpan?: Span) {
  expect(spanToJSON(actualSpan!)).toEqual(expect.objectContaining<Partial<SpanJSON>>({
    data: {
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: "ui.load.full_display",
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_MANUAL_UI_TIME_TO_DISPLAY,
    },
    description: 'Time To Full Display',
    op: 'ui.load.full_display',
    parent_span_id: expectedParentSpan ? spanToJSON(expectedParentSpan).span_id : undefined,
    start_timestamp: expect.any(Number),
    status: 'ok',
    timestamp: expect.any(Number),
  }));
}


function expectDeadlineExceededFullDisplaySpan(actualSpan?: Span, expectedParentSpan?: Span) {
  expect(spanToJSON(actualSpan!)).toEqual(expect.objectContaining<Partial<SpanJSON>>({
    data: {
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: "ui.load.full_display",
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_MANUAL_UI_TIME_TO_DISPLAY,
    },
    description: 'Time To Full Display',
    op: 'ui.load.full_display',
    parent_span_id: expectedParentSpan ? spanToJSON(expectedParentSpan).span_id : undefined,
    start_timestamp: expect.any(Number),
    status: 'deadline_exceeded',
    timestamp: expect.any(Number),
  }));
}

function expectNoTimeToDisplaySpans(span?: Span) {
  expect(getSpanDescendants(span!).map(spanToJSON)).toEqual(expect.not.arrayContaining<SpanJSON[]>([
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
