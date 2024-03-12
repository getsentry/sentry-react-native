import * as mockedtimetodisplaynative from './mockedtimetodisplaynative';
jest.mock('../../src/js/tracing/timetodisplaynative', () => mockedtimetodisplaynative);

import type { Span as SpanClass } from '@sentry/core';
import { getCurrentScope, getGlobalScope, getIsolationScope, setCurrentClient, spanToJSON, startSpanManual} from '@sentry/core';
import type { Measurements, Span, SpanJSON} from '@sentry/types';
import React from "react";
import TestRenderer from 'react-test-renderer';

import { _addTracingExtensions } from '../../src/js/tracing/addTracingExtensions';
import { startTimeToFullDisplaySpan, startTimeToInitialDisplaySpan, TimeToFullDisplay, TimeToInitialDisplay } from '../../src/js/tracing/timetodisplay';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';
import { asObjectWithMeasurements, secondAgoTimestampMs, secondInFutureTimestampMs } from '../testutils';
import { emitNativeFullDisplayEvent, emitNativeInitialDisplayEvent } from './mockedtimetodisplaynative';

jest.useFakeTimers({advanceTimers: true});

describe('TimeToDisplay', () => {
  let client: TestClient;

  beforeEach(() => {
    _addTracingExtensions();

    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();

    const options = getDefaultTestClientOptions({ tracesSampleRate: 1.0 });
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('creates manual initial display', () => {
    const [testSpan, activeSpan] = startSpanManual(
      {
        name: 'Root Manual Span',
        startTimestamp: secondAgoTimestampMs(),
      },
       (activeSpan: Span | undefined) => {
        const testSpan = startTimeToInitialDisplaySpan();
        TestRenderer.create(<TimeToInitialDisplay record={true} />);

        emitNativeInitialDisplayEvent();

        activeSpan?.end();

         return [testSpan, activeSpan];
      },
    );

    expectInitialDisplayMeasurementOnSpan(activeSpan);
    expectFinishedInitialDisplaySpan(testSpan, activeSpan);
    expect(spanToJSON(testSpan!).start_timestamp).toEqual(spanToJSON(activeSpan!).start_timestamp);
  });

  test('creates manual full display', () => {
    const [testSpan, activeSpan] = startSpanManual(
      {
        name: 'Root Manual Span',
        startTimestamp: secondAgoTimestampMs(),
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

    expectFullDisplayMeasurementOnSpan(activeSpan);
    expectFinishedFullDisplaySpan(testSpan, activeSpan);
    expect(spanToJSON(testSpan!).start_timestamp).toEqual(spanToJSON(activeSpan!).start_timestamp);
  });

  test('does not create full display when initial display is missing', () => {
    const [activeSpan] = startSpanManual(
      {
        name: 'Root Manual Span',
        startTimestamp: secondAgoTimestampMs(),
      },
      (activeSpan: Span | undefined) => {
        startTimeToFullDisplaySpan();
        TestRenderer.create(<TimeToFullDisplay record={true} />);

        emitNativeFullDisplayEvent();

        activeSpan?.end();
        return [activeSpan];
      },
    );

    expectNoInitialDisplayMeasurementOnSpan(activeSpan);
    expectNoFullDisplayMeasurementOnSpan(activeSpan);

    expectNoTimeToDisplaySpans(activeSpan);
  });

  test('creates initial display for active span without initial display span', () => {
    const [activeSpan] = startSpanManual(
      {
        name: 'Root Manual Span',
        startTimestamp: secondAgoTimestampMs(),
      },
      (activeSpan: Span | undefined) => {
        TestRenderer.create(<TimeToInitialDisplay record={true} />);

        emitNativeInitialDisplayEvent();

        activeSpan?.end();
        return [activeSpan];
      },
    );

    expectInitialDisplayMeasurementOnSpan(activeSpan);
    expectFinishedInitialDisplaySpan(getInitialDisplaySpan(activeSpan), activeSpan);
  });

  test('creates full display for active span without full display span', () => {
    const [activeSpan] = startSpanManual(
      {
        name: 'Root Manual Span',
        startTimestamp: secondAgoTimestampMs(),
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

    expectFullDisplayMeasurementOnSpan(activeSpan);
    expectFinishedFullDisplaySpan(getFullDisplaySpan(activeSpan), activeSpan);
  });

  test('cancels full display spans longer than 30s', () => {
    const [activeSpan] = startSpanManual(
      {
        name: 'Root Manual Span',
        startTimestamp: secondAgoTimestampMs(),
      },
      (activeSpan: Span | undefined) => {
        startTimeToInitialDisplaySpan();
        startTimeToFullDisplaySpan();

        TestRenderer.create(<TimeToInitialDisplay record={true} />);
        emitNativeInitialDisplayEvent();

        TestRenderer.create(<TimeToFullDisplay record={true} />);
        // native event is not emitted

        jest.advanceTimersByTime(40_000);

        return [activeSpan];
      },
    );

    expectFinishedInitialDisplaySpan(getInitialDisplaySpan(activeSpan), activeSpan);
    expectDeadlineExceededFullDisplaySpan(getFullDisplaySpan(activeSpan), activeSpan);

    expectInitialDisplayMeasurementOnSpan(activeSpan);
    expectFullDisplayMeasurementOnSpan(activeSpan);
    expect(asObjectWithMeasurements(activeSpan)._measurements!.time_to_full_display.value)
      .toEqual(asObjectWithMeasurements(activeSpan)._measurements!.time_to_initial_display.value);
  });

  test('consequent renders do not update display end', () => {
    const initialDisplayEndTimestampMs = secondInFutureTimestampMs();
    const fullDisplayEndTimestampMs = secondInFutureTimestampMs() + 500;
    const [initialDisplaySpan, fullDisplaySpan, activeSpan] = startSpanManual(
      {
        name: 'Root Manual Span',
        startTimestamp: secondAgoTimestampMs(),
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

        return [initialDisplaySpan, fullDisplaySpan, activeSpan];
      },
    );

    expectFinishedInitialDisplaySpan(initialDisplaySpan, activeSpan);
    expectFinishedFullDisplaySpan(fullDisplaySpan, activeSpan);

    expectInitialDisplayMeasurementOnSpan(activeSpan);
    expectFullDisplayMeasurementOnSpan(activeSpan);

    expect(spanToJSON(initialDisplaySpan!).timestamp).toEqual(initialDisplayEndTimestampMs / 1_000);
    expect(spanToJSON(fullDisplaySpan!).timestamp).toEqual(fullDisplayEndTimestampMs / 1_000);
  });
});

function getInitialDisplaySpan(span?: Span) {
  return getSpanDescendants(span)?.find(s => s.op === 'ui.load.initial_display');
}

function getFullDisplaySpan(span?: Span) {
  return getSpanDescendants(span)?.find(s => s.op === 'ui.load.full_display');
}

// Will be replaced by https://github.com/getsentry/sentry-javascript/blob/99d8390f667e8ad31a9b1fd62fbd4941162fab04/packages/core/src/tracing/utils.ts#L54
// after JS v8 upgrade
function getSpanDescendants(span?: Span) {
  return (span as SpanClass)?.spanRecorder?.spans;
}

function expectFinishedInitialDisplaySpan(actualSpan?: Span, expectedParentSpan?: Span) {
  expect(spanToJSON(actualSpan!)).toEqual(expect.objectContaining<Partial<SpanJSON>>({
    data: {
      "sentry.op": "ui.load.initial_display",
      "sentry.origin": "manual",
    },
    description: 'Time To Initial Display',
    op: 'ui.load.initial_display',
    parent_span_id: expectedParentSpan?.spanId,
    start_timestamp: expect.any(Number),
    status: 'ok',
    timestamp: expect.any(Number),
  }));
}

function expectFinishedFullDisplaySpan(actualSpan?: Span, expectedParentSpan?: Span) {
  expect(spanToJSON(actualSpan!)).toEqual(expect.objectContaining<Partial<SpanJSON>>({
    data: {
      "sentry.op": "ui.load.full_display",
      "sentry.origin": "manual",
    },
    description: 'Time To Full Display',
    op: 'ui.load.full_display',
    parent_span_id: expectedParentSpan?.spanId,
    start_timestamp: expect.any(Number),
    status: 'ok',
    timestamp: expect.any(Number),
  }));
}


function expectDeadlineExceededFullDisplaySpan(actualSpan?: Span, expectedParentSpan?: Span) {
  expect(spanToJSON(actualSpan!)).toEqual(expect.objectContaining<Partial<SpanJSON>>({
    data: {
      "sentry.op": "ui.load.full_display",
      "sentry.origin": "manual",
    },
    description: 'Time To Full Display',
    op: 'ui.load.full_display',
    parent_span_id: expectedParentSpan?.spanId,
    start_timestamp: expect.any(Number),
    status: 'deadline_exceeded',
    timestamp: expect.any(Number),
  }));
}

function expectNoTimeToDisplaySpans(span?: Span) {
  expect(getSpanDescendants(span)).toEqual(expect.not.arrayContaining<Span[]>([
    expect.objectContaining<Partial<Span>>({ op: 'ui.load.initial_display' }),
    expect.objectContaining<Partial<Span>>({ op: 'ui.load.full_display' }),
  ]));
}

function expectInitialDisplayMeasurementOnSpan(span?: Span) {
  expect(asObjectWithMeasurements(span)._measurements).toEqual(expect.objectContaining<Measurements>({
    time_to_initial_display: {
      value: expect.any(Number),
      unit: 'millisecond',
    },
  }));
}

function expectFullDisplayMeasurementOnSpan(span?: Span) {
  expect(asObjectWithMeasurements(span)._measurements).toEqual(expect.objectContaining<Measurements>({
    time_to_full_display: {
      value: expect.any(Number),
      unit: 'millisecond',
    },
  }));
}

function expectNoInitialDisplayMeasurementOnSpan(span?: Span) {
  expect(asObjectWithMeasurements(span)._measurements).toBeOneOf([
    undefined,
    expect.not.objectContaining<Measurements>({ time_to_initial_display: expect.anything() }),
  ]);
}

function expectNoFullDisplayMeasurementOnSpan(span?: Span) {
  expect(asObjectWithMeasurements(span)._measurements).toBeOneOf([
    undefined,
    expect.not.objectContaining<Measurements>({ time_to_full_display: expect.anything() }),
  ]);
}
