import type { Span } from '@sentry/core';
import { getActiveSpan, getCurrentScope, spanToJSON, startSpanManual } from '@sentry/core';
import type { AppState, AppStateStatus } from 'react-native';

import type { ScopeWithMaybeSpan } from '../../src/js/tracing/span';
import { SCOPE_SPAN_FIELD, startIdleNavigationSpan } from '../../src/js/tracing/span';
import { NATIVE } from '../../src/js/wrapper';
import { setupTestClient } from '../mocks/client';

type MockAppState = {
  setState: (state: AppStateStatus) => void;
  listener: (newState: AppStateStatus) => void;
  removeSubscription: jest.Func;
};
const mockedAppState: AppState & MockAppState = {
  removeSubscription: jest.fn(),
  listener: jest.fn(),
  isAvailable: true,
  currentState: 'active',
  addEventListener: (_, listener) => {
    mockedAppState.listener = listener;
    return {
      remove: mockedAppState.removeSubscription,
    };
  },
  setState: (state: AppStateStatus) => {
    mockedAppState.currentState = state;
    mockedAppState.listener(state);
  },
};
jest.mock('react-native/Libraries/AppState/AppState', () => mockedAppState);

describe('startIdleNavigationSpan', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    NATIVE.enableNative = true;
    mockedAppState.isAvailable = true;
    mockedAppState.addEventListener = (_, listener) => {
      mockedAppState.listener = listener;
      return {
        remove: mockedAppState.removeSubscription,
      };
    };
    setupTestClient();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('Cancels route transaction when app goes to background', async () => {
    const routeTransaction = startIdleNavigationSpan({
      name: 'test',
    });

    mockedAppState.setState('background');

    jest.runAllTimers();

    expect(routeTransaction).toBeDefined();
    expect(spanToJSON(routeTransaction!).status).toBe('cancelled');
    expect(mockedAppState.removeSubscription).toBeCalledTimes(1);
  });

  it('Does not crash when AppState is not available', async () => {
    mockedAppState.isAvailable = false;
    mockedAppState.addEventListener = ((): void => {
      return undefined;
    }) as unknown as (typeof mockedAppState)['addEventListener']; // RN Web can return undefined

    startIdleNavigationSpan({
      name: 'test',
    });

    await jest.advanceTimersByTimeAsync(500);
    const transaction = getActiveSpan();

    jest.runAllTimers();

    expect(spanToJSON(transaction!).timestamp).toBeDefined();
  });

  describe('Start a new active root span (without parent)', () => {
    it('Starts a new span when there is no active span', () => {
      const span = startIdleNavigationSpan({
        name: 'test',
      });

      expect(span).toBe(getActiveSpan());
    });

    it('Starts a new span when current active navigation span not ended', () => {
      startIdleNavigationSpan({
        name: 'test',
      });

      const secondSpan = startIdleNavigationSpan({
        name: 'test',
      });

      expect(secondSpan).toBe(getActiveSpan());
      expect(spanToJSON(secondSpan!).parent_span_id).toBeUndefined();
    });

    it('Starts a new span when current active navigation span is ended', () => {
      const firstSpan = startIdleNavigationSpan({
        name: 'test',
      });

      firstSpan.end();

      const secondSpan = startIdleNavigationSpan({
        name: 'test',
      });

      expect(secondSpan).toBe(getActiveSpan());
      expect(spanToJSON(secondSpan!).parent_span_id).toBeUndefined();
    });

    it('Starts a new span when current active span is not a navigation span', () => {
      const span = startSpanManual(
        {
          name: 'test',
        },
        (span: Span) => span,
      );
      setActiveSpanOnScope(getCurrentScope(), span);

      const newSpan = startIdleNavigationSpan({
        name: 'test',
      });
      expect(newSpan).toBe(getActiveSpan());
      expect(spanToJSON(newSpan!).parent_span_id).toBeUndefined();
    });
  });
});

export function setActiveSpanOnScope(scope: ScopeWithMaybeSpan, span: Span): void {
  scope[SCOPE_SPAN_FIELD] = span;
}
