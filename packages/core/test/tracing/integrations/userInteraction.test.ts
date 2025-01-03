import type { Span } from '@sentry/core';
import {
  getActiveSpan,
  getCurrentScope,
  SPAN_STATUS_ERROR,
  spanToJSON,
  startInactiveSpan,
  startSpanManual,
} from '@sentry/core';
import type { AppState, AppStateStatus } from 'react-native';

import {
  startUserInteractionSpan,
  userInteractionIntegration,
} from '../../../src/js/tracing/integrations/userInteraction';
import { SPAN_ORIGIN_MANUAL_INTERACTION } from '../../../src/js/tracing/origin';
import type { ReactNativeTracingIntegration } from '../../../src/js/tracing/reactnativetracing';
import { reactNativeTracingIntegration } from '../../../src/js/tracing/reactnativetracing';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../../src/js/tracing/semanticAttributes';
import { startIdleNavigationSpan } from '../../../src/js/tracing/span';
import { NATIVE } from '../../../src/js/wrapper';
import type { TestClient } from '../../mocks/client';
import { setupTestClient } from '../../mocks/client';

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

jest.mock('../../../src/js/wrapper', () => {
  return {
    NATIVE: {
      fetchNativeAppStart: jest.fn(),
      fetchNativeFrames: jest.fn(() => Promise.resolve()),
      disableNativeFramesTracking: jest.fn(() => Promise.resolve()),
      enableNativeFramesTracking: jest.fn(() => Promise.resolve()),
      enableNative: true,
    },
  };
});

describe('User Interaction Tracing', () => {
  let client: TestClient;
  let tracing: ReactNativeTracingIntegration;
  let mockedUserInteractionId: { elementId: string | undefined; op: string };

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

    mockedUserInteractionId = { elementId: 'mockedElementId', op: 'mocked.op' };
    client = setupTestClient({
      enableUserInteractionTracing: true,
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('disabled user interaction', () => {
    test('User interaction tracing is disabled by default', () => {
      client = setupTestClient({});
      startUserInteractionSpan(mockedUserInteractionId);

      expect(client.getOptions().enableUserInteractionTracing).toBeFalsy();
      expect(getActiveSpan()).toBeUndefined();
    });
  });

  describe('enabled user interaction', () => {
    beforeEach(() => {
      tracing = reactNativeTracingIntegration();
      client.addIntegration(userInteractionIntegration());
      client.addIntegration(tracing);
      tracing.setCurrentRoute('mockedRouteName');
    });

    test('user interaction tracing is enabled and transaction is bound to scope', () => {
      startUserInteractionSpan(mockedUserInteractionId);

      const actualTransaction = getActiveSpan();
      const actualTransactionContext = spanToJSON(actualTransaction!);
      expect(client.getOptions().enableUserInteractionTracing).toBeTruthy();
      expect(actualTransactionContext).toEqual(
        expect.objectContaining({
          description: 'mockedRouteName.mockedElementId',
          op: 'mocked.op',
          data: expect.objectContaining({
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_MANUAL_INTERACTION,
          }),
        }),
      );
    });

    test('UI event transaction not sampled if no child spans', () => {
      startUserInteractionSpan(mockedUserInteractionId);
      const actualTransaction = getActiveSpan();

      jest.runAllTimers();

      expect(actualTransaction).toBeDefined();
      expect(client.event).toBeUndefined();
    });

    test('does cancel UI event transaction when app goes to background', () => {
      startUserInteractionSpan(mockedUserInteractionId);
      const actualTransaction = getActiveSpan();

      mockedAppState.setState('background');
      jest.runAllTimers();

      const actualTransactionContext = spanToJSON(actualTransaction!);
      expect(actualTransactionContext).toEqual(
        expect.objectContaining({
          timestamp: expect.any(Number),
          status: 'cancelled',
        }),
      );
      expect(mockedAppState.removeSubscription).toBeCalledTimes(1);
    });

    test('do not overwrite existing status of UI event transactions', () => {
      startUserInteractionSpan(mockedUserInteractionId);
      const actualTransaction = getActiveSpan();

      actualTransaction?.setStatus({ code: SPAN_STATUS_ERROR, message: 'mocked_status' });

      jest.runAllTimers();

      const actualTransactionContext = spanToJSON(actualTransaction!);
      expect(actualTransactionContext).toEqual(
        expect.objectContaining({
          timestamp: expect.any(Number),
          status: 'mocked_status',
        }),
      );
    });

    test('same UI event and same element does not reschedule idle timeout', () => {
      const timeoutCloseToActualIdleTimeoutMs = 800;
      startUserInteractionSpan(mockedUserInteractionId);
      const actualTransaction = getActiveSpan();
      jest.advanceTimersByTime(timeoutCloseToActualIdleTimeoutMs);

      startUserInteractionSpan(mockedUserInteractionId);
      jest.advanceTimersByTime(timeoutCloseToActualIdleTimeoutMs);

      expect(spanToJSON(actualTransaction!).timestamp).toEqual(expect.any(Number));
    });

    test('different UI event and same element finish first and start new transaction', () => {
      const timeoutCloseToActualIdleTimeoutMs = 800;
      startUserInteractionSpan(mockedUserInteractionId);
      const firstTransaction = getActiveSpan();
      jest.advanceTimersByTime(timeoutCloseToActualIdleTimeoutMs);
      const childFirstTransaction = startInactiveSpan({ name: 'Child Span of the first Tx', op: 'child.op' });

      startUserInteractionSpan({ ...mockedUserInteractionId, op: 'different.op' });
      const secondTransaction = getActiveSpan();
      jest.advanceTimersByTime(timeoutCloseToActualIdleTimeoutMs);
      childFirstTransaction?.end();
      jest.runAllTimers();

      const firstTransactionEvent = client.eventQueue[0];
      expect(firstTransaction).toBeDefined();
      expect(firstTransactionEvent).toEqual(
        expect.objectContaining({
          timestamp: expect.any(Number),
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              op: 'mocked.op',
            }),
          }),
        }),
      );

      expect(secondTransaction).toBeDefined();
      expect(spanToJSON(secondTransaction!)).toEqual(
        expect.objectContaining({
          timestamp: expect.any(Number),
          op: 'different.op',
        }),
      );
      expect(firstTransactionEvent!.timestamp).toBeGreaterThanOrEqual(spanToJSON(secondTransaction!).start_timestamp!);
    });

    test('different UI event and same element finish first transaction with last span', () => {
      const timeoutCloseToActualIdleTimeoutMs = 800;
      startUserInteractionSpan(mockedUserInteractionId);
      const firstTransaction = getActiveSpan();
      jest.advanceTimersByTime(timeoutCloseToActualIdleTimeoutMs);
      const childFirstTransaction = startInactiveSpan({ name: 'Child Span of the first Tx', op: 'child.op' });

      startUserInteractionSpan({ ...mockedUserInteractionId, op: 'different.op' });
      jest.advanceTimersByTime(timeoutCloseToActualIdleTimeoutMs);
      childFirstTransaction?.end();
      jest.runAllTimers();

      const firstTransactionEvent = client.eventQueue[0];
      expect(firstTransaction).toBeDefined();
      expect(firstTransactionEvent).toEqual(
        expect.objectContaining({
          timestamp: expect.any(Number),
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              op: 'mocked.op',
            }),
          }),
        }),
      );
    });

    test('same ui event after UI event transaction finished', () => {
      startUserInteractionSpan(mockedUserInteractionId);
      const firstTransaction = getActiveSpan();
      jest.runAllTimers();

      startUserInteractionSpan(mockedUserInteractionId);
      const secondTransaction = getActiveSpan();
      jest.runAllTimers();

      const firstTransactionContext = spanToJSON(firstTransaction!);
      const secondTransactionContext = spanToJSON(secondTransaction!);
      expect(firstTransactionContext!.timestamp).toEqual(expect.any(Number));
      expect(secondTransactionContext!.timestamp).toEqual(expect.any(Number));
      expect(firstTransactionContext!.span_id).not.toEqual(secondTransactionContext!.span_id);
    });

    test('do not start UI event transaction if active transaction on scope', () => {
      const activeTransaction = startSpanManual(
        { name: 'activeTransactionOnScope', scope: getCurrentScope() },
        (span: Span) => span,
      );
      expect(activeTransaction).toBeDefined();
      expect(activeTransaction).toBe(getActiveSpan());

      startUserInteractionSpan(mockedUserInteractionId);
      expect(activeTransaction).toBe(getActiveSpan());
    });

    test('UI event transaction is canceled when routing transaction starts', () => {
      const timeoutCloseToActualIdleTimeoutMs = 800;
      startUserInteractionSpan(mockedUserInteractionId);
      const interactionTransaction = getActiveSpan();
      jest.advanceTimersByTime(timeoutCloseToActualIdleTimeoutMs);
      const routingTransaction = startIdleNavigationSpan({
        name: 'newMockedRouteName',
      });
      jest.runAllTimers();

      const interactionTransactionContext = spanToJSON(interactionTransaction!);
      const routingTransactionContext = spanToJSON(routingTransaction!);
      expect(interactionTransactionContext).toEqual(
        expect.objectContaining({
          timestamp: expect.any(Number),
          status: 'cancelled',
        }),
      );
      expect(routingTransactionContext).toEqual(
        expect.objectContaining({
          timestamp: expect.any(Number),
        }),
      );
      expect(interactionTransactionContext!.timestamp).toBeLessThanOrEqual(routingTransactionContext!.start_timestamp!);
    });
  });
});
