import { continueTrace, getCurrentScope, setCurrentClient } from '@sentry/core';

import { getDefaultTestClientOptions, TestClient } from './mocks/client';

describe('strictTraceContinuation', () => {
  let client: TestClient;

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('with matching org IDs', () => {
    beforeEach(() => {
      client = new TestClient(
        getDefaultTestClientOptions({
          tracesSampleRate: 1.0,
          dsn: 'https://abc@o123.ingest.sentry.io/1234',
        }),
      );
      setCurrentClient(client);
      client.init();
    });

    it('continues trace when baggage org_id matches DSN org ID', () => {
      const scope = continueTrace(
        {
          sentryTrace: '12312012123120121231201212312012-1121201211212012-1',
          baggage: 'sentry-org_id=123',
        },
        () => {
          return getCurrentScope();
        },
      );

      expect(scope.getPropagationContext().traceId).toBe('12312012123120121231201212312012');
      expect(scope.getPropagationContext().parentSpanId).toBe('1121201211212012');
    });
  });

  describe('with mismatching org IDs', () => {
    beforeEach(() => {
      client = new TestClient(
        getDefaultTestClientOptions({
          tracesSampleRate: 1.0,
          dsn: 'https://abc@o123.ingest.sentry.io/1234',
        }),
      );
      setCurrentClient(client);
      client.init();
    });

    it('starts new trace when baggage org_id does not match DSN org ID', () => {
      const scope = continueTrace(
        {
          sentryTrace: '12312012123120121231201212312012-1121201211212012-1',
          baggage: 'sentry-org_id=456',
        },
        () => {
          return getCurrentScope();
        },
      );

      expect(scope.getPropagationContext().traceId).not.toBe('12312012123120121231201212312012');
      expect(scope.getPropagationContext().parentSpanId).toBeUndefined();
    });
  });

  describe('with orgId option override', () => {
    beforeEach(() => {
      client = new TestClient(
        getDefaultTestClientOptions({
          tracesSampleRate: 1.0,
          dsn: 'https://abc@o123.ingest.sentry.io/1234',
          orgId: '999',
        }),
      );
      setCurrentClient(client);
      client.init();
    });

    it('uses orgId option over DSN-extracted org ID', () => {
      // baggage org_id=123 matches DSN but NOT the orgId option (999)
      const scope = continueTrace(
        {
          sentryTrace: '12312012123120121231201212312012-1121201211212012-1',
          baggage: 'sentry-org_id=123',
        },
        () => {
          return getCurrentScope();
        },
      );

      // Should start new trace because orgId option (999) != baggage org_id (123)
      expect(scope.getPropagationContext().traceId).not.toBe('12312012123120121231201212312012');
      expect(scope.getPropagationContext().parentSpanId).toBeUndefined();
    });

    it('continues trace when baggage matches orgId option', () => {
      const scope = continueTrace(
        {
          sentryTrace: '12312012123120121231201212312012-1121201211212012-1',
          baggage: 'sentry-org_id=999',
        },
        () => {
          return getCurrentScope();
        },
      );

      expect(scope.getPropagationContext().traceId).toBe('12312012123120121231201212312012');
      expect(scope.getPropagationContext().parentSpanId).toBe('1121201211212012');
    });
  });

  describe('strictTraceContinuation=true', () => {
    beforeEach(() => {
      client = new TestClient(
        getDefaultTestClientOptions({
          tracesSampleRate: 1.0,
          dsn: 'https://abc@o123.ingest.sentry.io/1234',
          strictTraceContinuation: true,
        }),
      );
      setCurrentClient(client);
      client.init();
    });

    it('starts new trace when baggage has no org_id', () => {
      const scope = continueTrace(
        {
          sentryTrace: '12312012123120121231201212312012-1121201211212012-1',
          baggage: 'sentry-environment=production',
        },
        () => {
          return getCurrentScope();
        },
      );

      expect(scope.getPropagationContext().traceId).not.toBe('12312012123120121231201212312012');
      expect(scope.getPropagationContext().parentSpanId).toBeUndefined();
    });

    it('starts new trace when SDK has no org_id but baggage does', () => {
      // Use a DSN without org ID in hostname
      const clientWithoutOrgId = new TestClient(
        getDefaultTestClientOptions({
          tracesSampleRate: 1.0,
          dsn: 'https://abc@sentry.example.com/1234',
          strictTraceContinuation: true,
        }),
      );
      setCurrentClient(clientWithoutOrgId);
      clientWithoutOrgId.init();

      const scope = continueTrace(
        {
          sentryTrace: '12312012123120121231201212312012-1121201211212012-1',
          baggage: 'sentry-org_id=123',
        },
        () => {
          return getCurrentScope();
        },
      );

      expect(scope.getPropagationContext().traceId).not.toBe('12312012123120121231201212312012');
      expect(scope.getPropagationContext().parentSpanId).toBeUndefined();
    });

    it('continues trace when both org IDs are missing', () => {
      const clientWithoutOrgId = new TestClient(
        getDefaultTestClientOptions({
          tracesSampleRate: 1.0,
          dsn: 'https://abc@sentry.example.com/1234',
          strictTraceContinuation: true,
        }),
      );
      setCurrentClient(clientWithoutOrgId);
      clientWithoutOrgId.init();

      const scope = continueTrace(
        {
          sentryTrace: '12312012123120121231201212312012-1121201211212012-1',
          baggage: 'sentry-environment=production',
        },
        () => {
          return getCurrentScope();
        },
      );

      expect(scope.getPropagationContext().traceId).toBe('12312012123120121231201212312012');
      expect(scope.getPropagationContext().parentSpanId).toBe('1121201211212012');
    });
  });

  describe('strictTraceContinuation=false (default)', () => {
    beforeEach(() => {
      client = new TestClient(
        getDefaultTestClientOptions({
          tracesSampleRate: 1.0,
          dsn: 'https://abc@o123.ingest.sentry.io/1234',
          strictTraceContinuation: false,
        }),
      );
      setCurrentClient(client);
      client.init();
    });

    it('continues trace when baggage has no org_id', () => {
      const scope = continueTrace(
        {
          sentryTrace: '12312012123120121231201212312012-1121201211212012-1',
          baggage: 'sentry-environment=production',
        },
        () => {
          return getCurrentScope();
        },
      );

      expect(scope.getPropagationContext().traceId).toBe('12312012123120121231201212312012');
      expect(scope.getPropagationContext().parentSpanId).toBe('1121201211212012');
    });

    it('continues trace when SDK has no org_id but baggage does', () => {
      const clientWithoutOrgId = new TestClient(
        getDefaultTestClientOptions({
          tracesSampleRate: 1.0,
          dsn: 'https://abc@sentry.example.com/1234',
          strictTraceContinuation: false,
        }),
      );
      setCurrentClient(clientWithoutOrgId);
      clientWithoutOrgId.init();

      const scope = continueTrace(
        {
          sentryTrace: '12312012123120121231201212312012-1121201211212012-1',
          baggage: 'sentry-org_id=123',
        },
        () => {
          return getCurrentScope();
        },
      );

      expect(scope.getPropagationContext().traceId).toBe('12312012123120121231201212312012');
      expect(scope.getPropagationContext().parentSpanId).toBe('1121201211212012');
    });

    it('still starts new trace when org IDs mismatch', () => {
      const scope = continueTrace(
        {
          sentryTrace: '12312012123120121231201212312012-1121201211212012-1',
          baggage: 'sentry-org_id=456',
        },
        () => {
          return getCurrentScope();
        },
      );

      expect(scope.getPropagationContext().traceId).not.toBe('12312012123120121231201212312012');
      expect(scope.getPropagationContext().parentSpanId).toBeUndefined();
    });
  });
});
