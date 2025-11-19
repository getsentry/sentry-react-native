import type { Span } from '@sentry/core';
import { getActiveSpan, getCurrentScope, spanToJSON, startSpanManual } from '@sentry/core';
import type { AppStateStatus } from 'react-native';
import { AppState } from 'react-native';
import type { ScopeWithMaybeSpan } from '../../src/js/tracing/span';
import { SCOPE_SPAN_FIELD, startIdleNavigationSpan } from '../../src/js/tracing/span';
import { NATIVE } from '../../src/js/wrapper';
import { setupTestClient } from '../mocks/client';

type MockAppState = {
  setState: (state: AppStateStatus) => void;
  listener: (newState: AppStateStatus) => void;
  removeSubscription: jest.Func;
};
jest.mock('react-native', () => {
  const mockedAppState: AppState & MockAppState = {
    removeSubscription: jest.fn(),
    listener: jest.fn(),
    isAvailable: true,
    currentState: 'active',
    addEventListener: jest.fn(),
    setState: (state: AppStateStatus) => {
      mockedAppState.currentState = state;
      mockedAppState.listener(state);
    },
  };
  return {
    AppState: mockedAppState,
    Platform: { OS: 'ios' },
    NativeModules: {
      RNSentry: {},
    },
  };
});

const mockedAppState = AppState as jest.Mocked<typeof AppState & MockAppState>;

describe('startIdleNavigationSpan', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    NATIVE.enableNative = true;
    mockedAppState.isAvailable = true;
    mockedAppState.currentState = 'active';
    (mockedAppState.addEventListener as jest.Mock).mockImplementation((_, listener) => {
      mockedAppState.listener = listener;
      return { remove: mockedAppState.removeSubscription };
    });
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
    expect(mockedAppState.removeSubscription).toHaveBeenCalledTimes(1);
  });

  it('Does not crash when AppState is not available', async () => {
    mockedAppState.isAvailable = false;
    (mockedAppState.addEventListener as jest.Mock).mockImplementation(() => {
      return undefined;
    });

    startIdleNavigationSpan({
      name: 'test',
    });

    await jest.advanceTimersByTimeAsync(500);
    const transaction = getActiveSpan();

    jest.runAllTimers();

    expect(spanToJSON(transaction!).timestamp).toBeDefined();
  });

  it('Returns non-recording span when app is already in background', () => {
    mockedAppState.currentState = 'background';

    const span = startIdleNavigationSpan({
      name: 'test',
    });

    // Non-recording spans don't become active
    expect(getActiveSpan()).toBeUndefined();

    // Verify it's a non-recording span
    expect(span).toBeDefined();
    expect(span?.constructor.name).toBe('SentryNonRecordingSpan');

    // No AppState listener should be set up for non-recording spans
    expect(mockedAppState.removeSubscription).not.toHaveBeenCalled();
  });

  it('Does not set up AppState listener for background spans', () => {
    mockedAppState.currentState = 'background';

    startIdleNavigationSpan({
      name: 'test',
    });

    mockedAppState.setState('active');

    // No subscription removal should happen since no listener was set up
    expect(mockedAppState.removeSubscription).not.toHaveBeenCalled();
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

      firstSpan?.end();

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

    it('Cancels user interaction span during normal navigation', () => {
      const userInteractionSpan = startSpanManual(
        {
          name: 'ui.action.touch',
          op: 'ui.action.touch',
          attributes: {
            'sentry.origin': 'auto.interaction',
          },
        },
        (span: Span) => span,
      );
      setActiveSpanOnScope(getCurrentScope(), userInteractionSpan);

      const navigationSpan = startIdleNavigationSpan({
        name: 'test',
      });

      expect(spanToJSON(userInteractionSpan).timestamp).toBeDefined();
      expect(spanToJSON(userInteractionSpan).status).toBe('cancelled');

      expect(navigationSpan).toBe(getActiveSpan());
    });

    it('Does NOT cancel user interaction span when navigation starts from runApplication (app restart)', () => {
      const userInteractionSpan = startSpanManual(
        {
          name: 'ui.action.touch',
          op: 'ui.action.touch',
          attributes: {
            'sentry.origin': 'auto.interaction',
          },
        },
        (span: Span) => span,
      );
      setActiveSpanOnScope(getCurrentScope(), userInteractionSpan);

      // Start navigation span from runApplication (app restart/reload - e.g. after error)
      const navigationSpan = startIdleNavigationSpan(
        {
          name: 'test',
        },
        { isFromRunApplication: true },
      );

      // User interaction span should NOT be cancelled/ended - preserving it for replay capture
      expect(spanToJSON(userInteractionSpan).timestamp).toBeUndefined();
      expect(spanToJSON(userInteractionSpan).status).not.toBe('cancelled');

      expect(navigationSpan).toBeDefined();
      expect(getActiveSpan()).toBe(navigationSpan);
    });
  });
});

export function setActiveSpanOnScope(scope: ScopeWithMaybeSpan, span: Span): void {
  scope[SCOPE_SPAN_FIELD] = span;
}
