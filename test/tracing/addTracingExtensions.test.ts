import { getCurrentScope, spanToJSON, startSpanManual } from '@sentry/core';

import { ReactNativeTracing } from '../../src/js';
import { type TestClient, setupTestClient } from '../mocks/client';

describe('Tracing extensions', () => {
  let client: TestClient;

  beforeEach(() => {
    client = setupTestClient({
      integrations: [new ReactNativeTracing()],
    });
  });

  test('transaction has default op', async () => {
    const transaction = startSpanManual({ name: 'parent' }, span => span);

    expect(spanToJSON(transaction!)).toEqual(
      expect.objectContaining({
        op: 'default',
      }),
    );
  });

  test('transaction does not overwrite custom op', async () => {
    const transaction = startSpanManual({ name: 'parent', op: 'custom' }, span => span);

    expect(spanToJSON(transaction!)).toEqual(
      expect.objectContaining({
        op: 'custom',
      }),
    );
  });

  test('transaction start span creates default op', async () => {
    // TODO: add event listener to spanStart and add default op if not set
    startSpanManual({ name: 'parent', scope: getCurrentScope() }, () => {});
    const span = startSpanManual({ name: 'child', scope: getCurrentScope() }, span => span);

    expect(spanToJSON(span!)).toEqual(
      expect.objectContaining({
        op: 'default',
      }),
    );
  });

  test('transaction start span keeps custom op', async () => {
    startSpanManual({ name: 'parent', op: 'custom', scope: getCurrentScope() }, () => {});
    const span = startSpanManual({ name: 'child', op: 'custom', scope: getCurrentScope() }, span => span);

    expect(spanToJSON(span!)).toEqual(
      expect.objectContaining({
        op: 'custom',
      }),
    );
  });

  test('transaction start span passes correct values to the child', async () => {
    const transaction = startSpanManual({ name: 'parent', op: 'custom', scope: getCurrentScope() }, span => span);
    const span = startSpanManual({ name: 'child', scope: getCurrentScope() }, span => span);
    span!.end();
    transaction!.end();

    await client.flush();
    expect(client.event).toEqual(
      expect.objectContaining({
        contexts: expect.objectContaining({
          trace: expect.objectContaining({
            trace_id: transaction!.spanContext().traceId,
          }),
        }),
      }),
    );
    expect(spanToJSON(span!)).toEqual(
      expect.objectContaining({
        parent_span_id: transaction!.spanContext().spanId,
      }),
    );
  });
});
