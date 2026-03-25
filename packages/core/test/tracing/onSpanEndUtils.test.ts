import type { Client, Span } from '@sentry/core';

import { getClient, startSpanManual } from '@sentry/core';

import {
  adjustTransactionDuration,
  cancelInBackground,
  ignoreEmptyBackNavigation,
  ignoreEmptyRouteChangeTransactions,
  onlySampleIfChildSpans,
  onThisSpanEnd,
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
