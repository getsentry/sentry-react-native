import * as mockedtimetodisplaynative from './mockedtimetodisplaynative';
jest.mock('../../src/js/tracing/timetodisplaynative', () => mockedtimetodisplaynative);

import { getCurrentScope, getGlobalScope, getIsolationScope, setCurrentClient, spanToJSON, startSpanManual } from '@sentry/core';
import type { Span, SpanJSON} from '@sentry/types';
import React from "react";
import TestRenderer from 'react-test-renderer';

import { _addTracingExtensions } from '../../src/js/tracing/addTracingExtensions';
import { startTimeToInitialDisplaySpan, TimeToDisplay } from '../../src/js/tracing/timetodisplay';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';
import { emitNativeInitialDisplayEvent } from './mockedtimetodisplaynative';

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

  test('creates manual span for initial display', () => {
    let ttidSpan: Span | undefined;
    let activeSpan: Span | undefined;
    startSpanManual(
      { name: 'Root Manual Span' },
      (span: Span | undefined) => {
        activeSpan = span;
        ttidSpan = startTimeToInitialDisplaySpan();
        TestRenderer.create(<TimeToDisplay initialDisplay={true} />);

        emitNativeInitialDisplayEvent();

        activeSpan?.end();
      },
    );

    expect(spanToJSON(ttidSpan!)).toEqual(expect.objectContaining<Partial<SpanJSON>>({
      data: {
        "sentry.op": "ui.load.initial_display",
        "sentry.origin": "manual",
      },
      description: 'Time To Initial Display',
      op: 'ui.load.initial_display',
      parent_span_id: activeSpan?.spanId,
      start_timestamp: expect.any(Number),
      status: 'ok',
      timestamp: expect.any(Number),
    }));
  });
});
