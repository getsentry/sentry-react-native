import type { Span } from '@sentry/core';
import {
  addBreadcrumb,
  captureFeedback,
  getCurrentScope,
  Scope,
  setCurrentClient,
  startSpan,
  withIsolationScope,
  withScope,
} from '@sentry/core';

import { getDefaultTestClientOptions, TestClient } from './mocks/client';

describe('captureFeedback', () => {
  beforeEach(() => {
    getCurrentScope().setClient(undefined);
    getCurrentScope().clear();
  });

  test('it works without a client', () => {
    const res = captureFeedback({
      message: 'test',
    });

    expect(typeof res).toBe('string');
  });

  test('it works with minimal options', async () => {
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://dsn@ingest.f00.f00/1',
        enableSend: true,
      }),
    );
    setCurrentClient(client);
    client.init();

    const mockTransport = jest.spyOn(client.getTransport()!, 'send');

    const eventId = captureFeedback({
      message: 'test',
    });

    await client.flush();

    expect(typeof eventId).toBe('string');

    expect(mockTransport).toHaveBeenCalledWith([
      {
        event_id: eventId,
        sent_at: expect.any(String),
      },
      [
        [
          { type: 'feedback' },
          {
            breadcrumbs: undefined,
            contexts: {
              trace: {
                span_id: expect.any(String),
                trace_id: expect.any(String),
              },
              feedback: {
                message: 'test',
              },
            },
            level: 'info',
            environment: 'production',
            event_id: eventId,
            timestamp: expect.any(Number),
            tags: undefined,
            type: 'feedback',
          },
        ],
      ],
    ]);
  });

  test('it works with full options', async () => {
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://dsn@ingest.f00.f00/1',
        enableSend: true,
      }),
    );
    setCurrentClient(client);
    client.init();

    const mockTransport = jest.spyOn(client.getTransport()!, 'send');

    const eventId = captureFeedback({
      name: 'doe',
      email: 're@example.org',
      message: 'mi',
      url: 'http://example.com/',
      source: 'custom-source',
      associatedEventId: '1234',
    });

    await client.flush();

    expect(typeof eventId).toBe('string');

    expect(mockTransport).toHaveBeenCalledWith([
      {
        event_id: eventId,
        sent_at: expect.any(String),
      },
      [
        [
          { type: 'feedback' },
          {
            breadcrumbs: undefined,
            contexts: {
              trace: {
                span_id: expect.any(String),
                trace_id: expect.any(String),
              },
              feedback: {
                name: 'doe',
                contact_email: 're@example.org',
                message: 'mi',
                url: 'http://example.com/',
                source: 'custom-source',
                associated_event_id: '1234',
              },
            },
            level: 'info',
            environment: 'production',
            event_id: eventId,
            timestamp: expect.any(Number),
            tags: undefined,
            type: 'feedback',
          },
        ],
      ],
    ]);
  });

  test('it captures attachments', async () => {
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://dsn@ingest.f00.f00/1',
        enableSend: true,
      }),
    );
    setCurrentClient(client);
    client.init();

    const mockTransport = jest.spyOn(client.getTransport()!, 'send');

    const attachment1 = new Uint8Array([1, 2, 3, 4, 5]);
    const attachment2 = new Uint8Array([6, 7, 8, 9]);

    const eventId = captureFeedback(
      {
        message: 'test',
      },
      {
        attachments: [
          {
            data: attachment1,
            filename: 'test-file.txt',
          },
          {
            data: attachment2,
            filename: 'test-file2.txt',
          },
        ],
      },
    );

    await client.flush();

    expect(typeof eventId).toBe('string');

    expect(mockTransport).toHaveBeenCalledTimes(1);

    const [feedbackEnvelope] = mockTransport.mock.calls;

    expect(feedbackEnvelope).toHaveLength(1);
    expect(feedbackEnvelope![0]).toEqual([
      {
        event_id: eventId,
        sent_at: expect.any(String),
      },
      [
        [
          { type: 'feedback' },
          {
            breadcrumbs: undefined,
            contexts: {
              trace: {
                span_id: expect.any(String),
                trace_id: expect.any(String),
              },
              feedback: {
                message: 'test',
              },
            },
            level: 'info',
            environment: 'production',
            event_id: eventId,
            timestamp: expect.any(Number),
            tags: undefined,
            type: 'feedback',
          },
        ],
        [
          {
            type: 'attachment',
            length: 5,
            filename: 'test-file.txt',
          },
          attachment1,
        ],
        [
          {
            type: 'attachment',
            length: 4,
            filename: 'test-file2.txt',
          },
          attachment2,
        ],
      ],
    ]);
  });

  test('it captures DSC from scope', async () => {
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://dsn@ingest.f00.f00/1',
        enableSend: true,
      }),
    );
    setCurrentClient(client);
    client.init();

    const mockTransport = jest.spyOn(client.getTransport()!, 'send');

    const traceId = '4C79F60C11214EB38604F4AE0781BFB2';
    const spanId = 'FA90FDEAD5F74052';
    const dsc = {
      trace_id: traceId,
      span_id: spanId,
      sampled: 'true',
    };

    getCurrentScope().setPropagationContext({
      traceId,
      spanId,
      dsc,
    });

    const eventId = captureFeedback({
      message: 'test',
    });

    await client.flush();

    expect(typeof eventId).toBe('string');

    expect(mockTransport).toHaveBeenCalledWith([
      {
        event_id: eventId,
        sent_at: expect.any(String),
      },
      [
        [
          { type: 'feedback' },
          {
            breadcrumbs: undefined,
            contexts: {
              trace: {
                trace_id: traceId,
                span_id: spanId,
              },
              feedback: {
                message: 'test',
              },
            },
            level: 'info',
            environment: 'production',
            event_id: eventId,
            timestamp: expect.any(Number),
            tags: undefined,
            type: 'feedback',
          },
        ],
      ],
    ]);
  });

  test('it captures data from active span', async () => {
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://dsn@ingest.f00.f00/1',
        enableSend: true,
        enableTracing: true,
        // We don't care about transactions here...
        beforeSendTransaction() {
          return null;
        },
      }),
    );
    setCurrentClient(client);
    client.init();

    const mockTransport = jest.spyOn(client.getTransport()!, 'send');

    let span: Span | undefined;
    const eventId = startSpan({ name: 'test-span' }, _span => {
      span = _span;
      return captureFeedback({
        message: 'test',
      });
    });

    await client.flush();

    expect(typeof eventId).toBe('string');
    expect(span).toBeDefined();

    const { spanId, traceId } = span!.spanContext();

    expect(mockTransport).toHaveBeenCalledWith([
      {
        event_id: eventId,
        sent_at: expect.any(String),
      },
      [
        [
          { type: 'feedback' },
          {
            breadcrumbs: undefined,
            contexts: {
              trace: {
                trace_id: traceId,
                span_id: spanId,
              },
              feedback: {
                message: 'test',
              },
            },
            level: 'info',
            environment: 'production',
            event_id: eventId,
            timestamp: expect.any(Number),
            tags: undefined,
            type: 'feedback',
          },
        ],
      ],
    ]);
  });

  it('applies scope data to feedback', async () => {
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://dsn@ingest.f00.f00/1',
        enableSend: true,
        enableTracing: true,
        // We don't care about transactions here...
        beforeSendTransaction() {
          return null;
        },
      }),
    );
    setCurrentClient(client);
    client.init();

    const mockTransport = jest.spyOn(client.getTransport()!, 'send');

    withIsolationScope(isolationScope => {
      isolationScope.setTag('test-1', 'tag');
      isolationScope.setExtra('test-1', 'extra');

      return withScope(scope => {
        scope.setTag('test-2', 'tag');
        scope.setExtra('test-2', 'extra');

        addBreadcrumb({ message: 'test breadcrumb', timestamp: 12345 });

        captureFeedback({
          name: 'doe',
          email: 're@example.org',
          message: 'mi',
        });
      });
    });

    expect(mockTransport).toHaveBeenCalledWith([
      {
        event_id: expect.any(String),
        sent_at: expect.any(String),
      },
      [
        [
          { type: 'feedback' },
          {
            breadcrumbs: [{ message: 'test breadcrumb', timestamp: 12345 }],
            contexts: {
              trace: {
                span_id: expect.any(String),
                trace_id: expect.any(String),
              },
              feedback: {
                contact_email: 're@example.org',
                message: 'mi',
                name: 'doe',
              },
            },
            extra: {
              'test-1': 'extra',
              'test-2': 'extra',
            },
            tags: {
              'test-1': 'tag',
              'test-2': 'tag',
            },
            level: 'info',
            environment: 'production',
            event_id: expect.any(String),
            timestamp: expect.any(Number),
            type: 'feedback',
          },
        ],
      ],
    ]);
  });

  test('it allows to pass a custom client', async () => {
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://dsn@ingest.f00.f00/1',
        enableSend: true,
      }),
    );
    setCurrentClient(client);
    client.init();

    const client2 = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://dsn@ingest.f00.f00/1',
        enableSend: true,
        defaultIntegrations: false,
      }),
    );
    client2.init();
    const scope = new Scope();
    scope.setClient(client2);

    const mockTransport = jest.spyOn(client.getTransport()!, 'send');
    const mockTransport2 = jest.spyOn(client2.getTransport()!, 'send');

    const eventId = captureFeedback(
      {
        message: 'test',
      },
      {},
      scope,
    );

    await client.flush();
    await client2.flush();

    expect(typeof eventId).toBe('string');

    expect(mockTransport).not.toHaveBeenCalled();
    expect(mockTransport2).toHaveBeenCalledTimes(1);
  });
});
