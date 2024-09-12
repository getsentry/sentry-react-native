import { setCurrentClient, spanToJSON, startSpan } from '@sentry/core';

import { getDefaultTestClientOptions, TestClient } from './mocks/client';

describe('parentSpanIsAlwaysRootSpan', () => {
  let client: TestClient;

  it('creates a span as child of root span if parentSpanIsAlwaysRootSpan=true', () => {
    const options = getDefaultTestClientOptions({
      tracesSampleRate: 1,
      parentSpanIsAlwaysRootSpan: true,
    });
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();

    startSpan({ name: 'parent span' }, span => {
      expect(spanToJSON(span).parent_span_id).toBe(undefined);
      startSpan({ name: 'child span' }, childSpan => {
        expect(spanToJSON(childSpan).parent_span_id).toBe(span.spanContext().spanId);
        startSpan({ name: 'grand child span' }, grandChildSpan => {
          expect(spanToJSON(grandChildSpan).parent_span_id).toBe(span.spanContext().spanId);
        });
      });
    });
  });

  it('does not creates a span as child of root span if parentSpanIsAlwaysRootSpan=false', () => {
    const options = getDefaultTestClientOptions({
      tracesSampleRate: 1,
      parentSpanIsAlwaysRootSpan: false,
    });
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();

    startSpan({ name: 'parent span' }, span => {
      expect(spanToJSON(span).parent_span_id).toBe(undefined);
      startSpan({ name: 'child span' }, childSpan => {
        expect(spanToJSON(childSpan).parent_span_id).toBe(span.spanContext().spanId);
        startSpan({ name: 'grand child span' }, grandChildSpan => {
          expect(spanToJSON(grandChildSpan).parent_span_id).toBe(childSpan.spanContext().spanId);
        });
      });
    });
  });
});
