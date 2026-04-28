import type { Client, Span } from '@sentry/core';

import { getClient, spanToJSON, startSpan, startSpanManual } from '@sentry/core';

import {
  adjustTransactionDuration,
  cancelInBackground,
  ignoreEmptyBackNavigation,
  ignoreEmptyRouteChangeTransactions,
  onlySampleIfChildSpans,
  onThisSpanEnd,
  SENTRY_DISCARD_REASON_ATTRIBUTE,
} from '../../src/js/tracing/onSpanEndUtils';
import { setupTestClient } from '../mocks/client';

jest.mock('react-native', () => ({
  AppState: {
    isAvailable: true,
    currentState: 'active',
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  Platform: { OS: 'android' },
  NativeModules: { RNSentry: {} },
}));

/**
 * Wraps client.on to intercept the unsubscribe functions returned by each call.
 * Returns a getter for how many times any of those unsubscribe functions were called.
 */
function trackUnsubscribes(client: Client): () => number {
  let count = 0;
  const originalOn = client.on.bind(client);
  jest
    .spyOn(client, 'on')
    .mockImplementation((hook: Parameters<Client['on']>[0], callback: Parameters<Client['on']>[1]) => {
      const realUnsubscribe = (originalOn as any)(hook, callback);
      return () => {
        count++;
        realUnsubscribe();
      };
    });
  return () => count;
}

function createRootSpan(name: string): Span {
  return startSpanManual({ name, forceTransaction: true }, span => span);
}

describe('onSpanEndUtils', () => {
  beforeEach(() => {
    setupTestClient();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onThisSpanEnd', () => {
    it('calls callback when the target span ends', () => {
      const client = getClient()!;
      const callback = jest.fn();
      const span = createRootSpan('target');

      onThisSpanEnd(client, span, callback);
      span.end();

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(span);
    });

    it('does not call callback when a different span ends', () => {
      const client = getClient()!;
      const callback = jest.fn();
      const targetSpan = createRootSpan('target');
      const otherSpan = createRootSpan('other');

      onThisSpanEnd(client, targetSpan, callback);
      otherSpan.end();

      expect(callback).not.toHaveBeenCalled();
    });

    it('unsubscribes the listener after the target span ends', () => {
      const client = getClient()!;
      const getUnsubscribeCount = trackUnsubscribes(client);
      const span = createRootSpan('target');

      onThisSpanEnd(client, span, jest.fn());
      expect(getUnsubscribeCount()).toBe(0);

      span.end();
      expect(getUnsubscribeCount()).toBe(1);
    });

    it('does not call callback for spans ending after the target span', () => {
      const client = getClient()!;
      const callback = jest.fn();
      const targetSpan = createRootSpan('target');
      const laterSpan = createRootSpan('later');

      onThisSpanEnd(client, targetSpan, callback);
      targetSpan.end(); // fires callback, listener unsubscribes
      laterSpan.end(); // listener is gone — callback must not fire again

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('adjustTransactionDuration', () => {
    it('unsubscribes the listener after the span ends', () => {
      const client = getClient()!;
      const getUnsubscribeCount = trackUnsubscribes(client);
      const span = createRootSpan('target');

      adjustTransactionDuration(client, span, 60_000);
      expect(getUnsubscribeCount()).toBe(0);

      span.end();
      expect(getUnsubscribeCount()).toBe(1);
    });
  });

  describe('ignoreEmptyBackNavigation', () => {
    it('unsubscribes the listener after the span ends', () => {
      const client = getClient()!;
      const getUnsubscribeCount = trackUnsubscribes(client);
      const span = createRootSpan('target');

      ignoreEmptyBackNavigation(client, span);
      expect(getUnsubscribeCount()).toBe(0);

      span.end();
      expect(getUnsubscribeCount()).toBe(1);
    });

    it('marks the span for discard without mutating sampling', () => {
      const client = getClient()!;
      const span = createRootSpan('target') as Span & { _sampled?: boolean };
      span.setAttribute('route.has_been_seen', true);

      ignoreEmptyBackNavigation(client, span);
      span.end();

      expect(spanToJSON(span).data?.[SENTRY_DISCARD_REASON_ATTRIBUTE]).toBe('empty_back_navigation');
      expect(span._sampled).not.toBe(false);
    });

    it('does not mark the span when the route has not been seen', () => {
      const client = getClient()!;
      const span = createRootSpan('target');

      ignoreEmptyBackNavigation(client, span);
      span.end();

      expect(spanToJSON(span).data?.[SENTRY_DISCARD_REASON_ATTRIBUTE]).toBeUndefined();
    });

    it('does not mark the span when meaningful child spans exist', () => {
      const client = getClient()!;
      let parent: Span | undefined;
      startSpan({ name: 'parent', forceTransaction: true }, span => {
        parent = span;
        span.setAttribute('route.has_been_seen', true);
        ignoreEmptyBackNavigation(client, span);
        startSpan({ name: 'meaningful child' }, () => undefined);
      });

      expect(spanToJSON(parent!).data?.[SENTRY_DISCARD_REASON_ATTRIBUTE]).toBeUndefined();
    });
  });

  describe('ignoreEmptyRouteChangeTransactions', () => {
    it('unsubscribes the listener after the span ends', () => {
      const client = getClient()!;
      const getUnsubscribeCount = trackUnsubscribes(client);
      const span = createRootSpan('Route Change');

      ignoreEmptyRouteChangeTransactions(client, span, 'Route Change', () => true);
      expect(getUnsubscribeCount()).toBe(0);

      span.end();
      expect(getUnsubscribeCount()).toBe(1);
    });

    it('marks the span for discard when the route name is missing', () => {
      const client = getClient()!;
      const span = createRootSpan('Route Change') as Span & { _sampled?: boolean };

      ignoreEmptyRouteChangeTransactions(client, span, 'Route Change', () => true);
      span.end();

      expect(spanToJSON(span).data?.[SENTRY_DISCARD_REASON_ATTRIBUTE]).toBe('no_route_info');
      expect(span._sampled).not.toBe(false);
    });

    it('does not mark the span when route info has been received', () => {
      const client = getClient()!;
      const span = createRootSpan('Route Change');
      span.setAttribute('route.name', 'Home');

      ignoreEmptyRouteChangeTransactions(client, span, 'Route Change', () => true);
      span.end();

      expect(spanToJSON(span).data?.[SENTRY_DISCARD_REASON_ATTRIBUTE]).toBeUndefined();
    });
  });

  describe('onlySampleIfChildSpans', () => {
    it('unsubscribes the listener after the span ends', () => {
      const client = getClient()!;
      const getUnsubscribeCount = trackUnsubscribes(client);
      const span = createRootSpan('target');

      onlySampleIfChildSpans(client, span);
      expect(getUnsubscribeCount()).toBe(0);

      span.end();
      expect(getUnsubscribeCount()).toBe(1);
    });

    it('marks childless root spans for discard', () => {
      const client = getClient()!;
      const span = createRootSpan('target') as Span & { _sampled?: boolean };

      onlySampleIfChildSpans(client, span);
      span.end();

      expect(spanToJSON(span).data?.[SENTRY_DISCARD_REASON_ATTRIBUTE]).toBe('no_child_spans');
      expect(span._sampled).not.toBe(false);
    });
  });

  describe('cancelInBackground', () => {
    it('removes the AppState subscription when the span ends normally', () => {
      const { AppState } = jest.requireMock('react-native');
      const removeMock = jest.fn();
      (AppState.addEventListener as jest.Mock).mockReturnValueOnce({ remove: removeMock });

      const client = getClient()!;
      const span = createRootSpan('target');

      cancelInBackground(client, span);
      expect(removeMock).not.toHaveBeenCalled();

      span.end();
      expect(removeMock).toHaveBeenCalledTimes(1);
    });

    it('unsubscribes the spanEnd listener after the span ends', () => {
      const client = getClient()!;
      const getUnsubscribeCount = trackUnsubscribes(client);
      const span = createRootSpan('target');

      cancelInBackground(client, span);
      expect(getUnsubscribeCount()).toBe(0);

      span.end();
      expect(getUnsubscribeCount()).toBe(1);
    });
  });

  describe('listener accumulation', () => {
    it('does not accumulate listeners across multiple spans', () => {
      const client = getClient()!;
      const getUnsubscribeCount = trackUnsubscribes(client);
      const callbacks = Array.from({ length: 5 }, () => jest.fn());

      for (let i = 0; i < 5; i++) {
        const span = createRootSpan(`span-${i}`);
        onThisSpanEnd(client, span, callbacks[i]);
        span.end();
      }

      // Every registered listener must have unsubscribed itself
      expect(getUnsubscribeCount()).toBe(5);

      // Ending a new span must not trigger any of the already-fired callbacks
      const newSpan = createRootSpan('new');
      newSpan.end();

      callbacks.forEach(cb => expect(cb).toHaveBeenCalledTimes(1));
    });
  });
});
