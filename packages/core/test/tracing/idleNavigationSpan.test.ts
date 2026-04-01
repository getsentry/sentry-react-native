import type { Span } from '@sentry/core';
import type { AppStateStatus } from 'react-native';

import {
  getActiveSpan,
  getCurrentScope,
  spanToJSON,
  startInactiveSpan,
  startSpanManual,
  timestampInSeconds,
} from '@sentry/core';
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
    jest.useFakeTimers({ doNotFake: ['performance'] });
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

  it('Returns non-recording span when app is already inactive', () => {
    mockedAppState.currentState = 'inactive';

    const span = startIdleNavigationSpan({
      name: 'test',
    });

    expect(getActiveSpan()).toBeUndefined();
    expect(span).toBeDefined();
    expect(span?.constructor.name).toBe('SentryNonRecordingSpan');
    expect(mockedAppState.removeSubscription).not.toHaveBeenCalled();
  });

  describe('cancelInBackground with iOS inactive state', () => {
    it('Schedules deferred cancellation on inactive and cancels after timeout', () => {
      const routeTransaction = startIdleNavigationSpan({
        name: 'test',
      });

      // Keep the span alive with an open child span (simulates in-flight network request)
      startInactiveSpan({ name: 'child-span' });

      // App goes inactive (e.g. user presses home button on iOS)
      mockedAppState.setState('inactive');

      // Span should still be open — not cancelled immediately
      expect(spanToJSON(routeTransaction!).status).not.toBe('cancelled');
      expect(spanToJSON(routeTransaction!).timestamp).toBeUndefined();

      // Advance past the deferred cancellation timeout (5 seconds)
      jest.advanceTimersByTime(5_000);

      // Now the deferred cancellation should have fired
      expect(spanToJSON(routeTransaction!).status).toBe('cancelled');
      expect(spanToJSON(routeTransaction!).timestamp).toBeDefined();
      expect(mockedAppState.removeSubscription).toHaveBeenCalledTimes(1);
    });

    it('Clears deferred cancellation when app returns to active', () => {
      const routeTransaction = startIdleNavigationSpan({
        name: 'test',
      });

      // App goes inactive (e.g. Control Center pulled down)
      mockedAppState.setState('inactive');

      // Advance part way — not enough for the timeout to fire
      jest.advanceTimersByTime(2_000);

      // App returns to active (Control Center dismissed)
      mockedAppState.setState('active');

      // Advance well past the original timeout
      jest.advanceTimersByTime(10_000);

      // Span should NOT be cancelled — it's still recording
      expect(spanToJSON(routeTransaction!).status).not.toBe('cancelled');
    });

    it('Cancels immediately on background even if inactive timeout is pending', () => {
      const routeTransaction = startIdleNavigationSpan({
        name: 'test',
      });

      // App goes inactive first
      mockedAppState.setState('inactive');

      // Then transitions to background before the timeout fires
      jest.advanceTimersByTime(100);
      mockedAppState.setState('background');

      // Span should be cancelled immediately
      expect(spanToJSON(routeTransaction!).status).toBe('cancelled');
      expect(spanToJSON(routeTransaction!).timestamp).toBeDefined();
      expect(mockedAppState.removeSubscription).toHaveBeenCalledTimes(1);
    });

    it('Clears inactive timeout when span ends normally', () => {
      const routeTransaction = startIdleNavigationSpan({
        name: 'test',
      });

      // App goes inactive — deferred cancellation is scheduled
      mockedAppState.setState('inactive');

      // Span ends normally (e.g. idle timeout, new navigation)
      routeTransaction!.end();

      jest.runAllTimers();

      // AppState listener should be cleaned up
      expect(mockedAppState.removeSubscription).toHaveBeenCalledTimes(1);
      // Span should not have the cancelled status since it ended normally
      expect(spanToJSON(routeTransaction!).status).not.toBe('cancelled');
    });
  });

  describe('http.client child spans during background cancellation', () => {
    it('ends http.client child at the time the app went inactive, not when the deferred timer fires', () => {
      const navSpan = startIdleNavigationSpan({ name: 'test' });
      const httpSpan = startInactiveSpan({ name: 'GET /api/data', op: 'http.client' });
      const httpStartTime = spanToJSON(httpSpan).start_timestamp;

      // App goes inactive at a known time (e.g. user presses home on iOS)
      mockedAppState.setState('inactive');

      // Simulate JS thread suspension + resume: advance well past the 5s timer.
      // In production this delay is caused by the JS thread being suspended
      // while the app is in the background, then resumed much later.
      jest.advanceTimersByTime(30_000);

      expect(spanToJSON(navSpan!).status).toBe('cancelled');

      // The http.client span should be ended at approximately when the app
      // went inactive, NOT 30 seconds later when the timer fired.
      const httpEndTime = spanToJSON(httpSpan).timestamp!;
      const httpDuration = httpEndTime - httpStartTime;
      expect(httpDuration).toBeLessThan(1);
      expect(spanToJSON(httpSpan).status).toBe('cancelled');
    });

    it('uses fresh timestamp after inactive → active → background cycle', () => {
      startIdleNavigationSpan({ name: 'test' });
      const httpSpan = startInactiveSpan({ name: 'GET /api/data', op: 'http.client' });

      // App goes inactive briefly (e.g. Control Center)
      mockedAppState.setState('inactive');
      const inactiveTime = timestampInSeconds();

      jest.advanceTimersByTime(1_000);

      // App returns to active — the inactive timestamp should be reset
      mockedAppState.setState('active');

      jest.advanceTimersByTime(2_000);

      // Now app goes to background — should use this new timestamp, not the old inactive one
      const backgroundTime = timestampInSeconds();
      mockedAppState.setState('background');

      const httpEndTime = spanToJSON(httpSpan).timestamp!;

      // The end time should match the background event, not the earlier inactive event.
      // Use toBeCloseTo because timestampInSeconds() may advance slightly between calls.
      expect(httpEndTime).toBeCloseTo(backgroundTime, 1);

      // If the inactive timestamp was NOT reset, the span would have ended
      // at inactiveTime instead — verify that's not the case when they differ.
      if (Math.abs(backgroundTime - inactiveTime) > 0.01) {
        expect(httpEndTime).not.toBeCloseTo(inactiveTime, 1);
      }
    });

    it('ends http.client child at background time on immediate background', () => {
      const navSpan = startIdleNavigationSpan({ name: 'test' });
      const httpSpan = startInactiveSpan({ name: 'GET /api/data', op: 'http.client' });

      // App goes directly to background (Android, or iOS without inactive)
      mockedAppState.setState('background');

      expect(spanToJSON(navSpan!).status).toBe('cancelled');
      expect(spanToJSON(httpSpan).timestamp).toBeDefined();
      expect(spanToJSON(httpSpan).status).toBe('cancelled');
    });

    it('preserves already-ended http.client spans when app backgrounds', () => {
      const navSpan = startIdleNavigationSpan({ name: 'test' });

      // HTTP request that completed before backgrounding
      const httpSpan = startInactiveSpan({ name: 'GET /api/data', op: 'http.client' });
      httpSpan.setStatus({ code: 1 }); // OK
      httpSpan.end();

      const httpEndTimeBefore = spanToJSON(httpSpan).timestamp;

      // App goes to background
      mockedAppState.setState('background');

      expect(spanToJSON(navSpan!).status).toBe('cancelled');

      // The already-ended http.client span should be untouched
      expect(spanToJSON(httpSpan).status).toBe('ok');
      expect(spanToJSON(httpSpan).timestamp).toBe(httpEndTimeBefore);
    });

    it('still cancels non-http.client children when app backgrounds', () => {
      const navSpan = startIdleNavigationSpan({ name: 'test' });

      // A non-http span (e.g. a UI rendering span)
      const uiSpan = startInactiveSpan({ name: 'ui.render', op: 'ui.load' });

      mockedAppState.setState('background');

      expect(spanToJSON(navSpan!).status).toBe('cancelled');

      // Non-http.client children should still be cancelled by idle span logic
      expect(spanToJSON(uiSpan).timestamp).toBeDefined();
      expect(spanToJSON(uiSpan).status).toBe('cancelled');
    });
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
        { isAppRestart: true },
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
