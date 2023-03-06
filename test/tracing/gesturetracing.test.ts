import { BrowserClient } from '@sentry/browser';
import type { BrowserClientOptions } from '@sentry/browser/types/client';
import { Hub } from '@sentry/core';
import type { IntegrationIndex } from '@sentry/core/types/integration';
import type { Scope, Transaction, User } from '@sentry/types';

import { UI_ACTION_GESTURE } from '../../src/js/tracing';
import { traceGesture } from '../../src/js/tracing/gesturetracing';
import { ReactNativeTracing } from '../../src/js/tracing/reactnativetracing';
import type {
  MockedRoutingInstrumentation
} from './mockedrountinginstrumention';
import {
  createMockedRoutingInstrumentation,
  mockedConfirmedRouteTransactionContext
} from './mockedrountinginstrumention';

jest.mock('../../src/js/wrapper', () => {
  return {
    NATIVE: {
      fetchNativeAppStart: jest.fn(),
      fetchNativeFrames: jest.fn(() => Promise.resolve()),
      enableNativeFramesTracking: jest.fn(() => Promise.resolve()),
      enableNative: true,
    },
  };
});

const getMockScope = () => {
  let scopeTransaction: unknown;
  let scopeUser: User | undefined;

  return {
    getTransaction: () => scopeTransaction,
    setSpan: jest.fn((span: unknown) => {
      scopeTransaction = span;
    }),
    setTag(_tag: unknown) {
      // Placeholder
    },
    addBreadcrumb(_breadcrumb: unknown) {
      // Placeholder
    },
    getUser: () => scopeUser,
  }
};

const getMockHub = () => {
  const mockHub = new Hub(new BrowserClient({ tracesSampleRate: 1 } as BrowserClientOptions));
  const mockScope = getMockScope();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockHub.getScope = () => mockScope as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockHub.configureScope = jest.fn((callback) => callback(mockScope as any));

  return mockHub;
};

interface MockGesture {
  handlers?: {
    onBegin?: jest.Mock;
  };
}

describe('GestureTracing', () => {
  const label = 'testGesture';

  describe('gracefully fails on invalid gestures', () => {
    it('gesture is undefined', () => {
      const gesture = undefined;
      expect(traceGesture(label, gesture)).toBeUndefined();
    });

    it('gesture has no handlers', () => {
      const gesture = {};
      expect(traceGesture(label, gesture)).toEqual({});
    });
  });

  describe('traces gestures', () => {
    let mockedScope: Scope;
    let mockedHub: Hub;
    let tracing: ReactNativeTracing;
    let mockedRoutingInstrumentation: MockedRoutingInstrumentation;
    let mockedGesture: MockGesture;

    beforeEach(() => {
      jest.useFakeTimers();
      mockedHub = getMockHub();
      mockedScope = mockedHub.getScope()!;
      mockedRoutingInstrumentation = createMockedRoutingInstrumentation();
      tracing = new ReactNativeTracing({
        routingInstrumentation: mockedRoutingInstrumentation,
        enableUserInteractionTracing: true,
      });
      tracing.setupOnce(jest.fn(), jest.fn().mockReturnValue(mockedHub));
      // client.addIntegration uses global getCurrentHub, so we don't use it to keep the mockedHub
      (mockedHub.getClient() as unknown as { _integrations: IntegrationIndex })
        ._integrations[ReactNativeTracing.name] = tracing;
      mockedRoutingInstrumentation.registeredOnConfirmRoute!(mockedConfirmedRouteTransactionContext);
      mockedGesture = { handlers: { onBegin: jest.fn() } };
    });

    afterEach(() => {
      jest.runAllTimers();
      jest.useRealTimers();
    });

    it('gesture creates interaction transaction', () => {
      traceGesture('mockedGesture', mockedGesture, { getCurrentHub: () => mockedHub });
      mockedGesture.handlers!.onBegin!();
      const transaction = mockedScope.getTransaction() as Transaction | undefined;
      jest.runAllTimers();

      const transactionContext = transaction?.toContext();
      expect(transactionContext).toEqual(expect.objectContaining({
        endTimestamp: expect.any(Number),
        op: UI_ACTION_GESTURE,
      }));
    });

    it('gesture cancel previous interaction transaction', () => {
      const timeoutCloseToActualIdleTimeoutMs = 800;

      traceGesture('mockedGesture', mockedGesture, { getCurrentHub: () => mockedHub });

      const mockedTouchInteractionId = { elementId: 'mockedElementId', op: 'mocked.op' };
      tracing.startUserInteractionTransaction(mockedTouchInteractionId);
      const touchTransaction = mockedScope.getTransaction() as Transaction | undefined;
      touchTransaction?.startChild({ op: 'child.op' }).finish();
      jest.advanceTimersByTime(timeoutCloseToActualIdleTimeoutMs);

      mockedGesture.handlers?.onBegin?.();

      const gestureTransaction = mockedScope.getTransaction() as Transaction | undefined;
      jest.advanceTimersByTime(timeoutCloseToActualIdleTimeoutMs);
      jest.runAllTimers();

      const touchTransactionContext = touchTransaction?.toContext();
      const gestureTransactionContext = gestureTransaction?.toContext();
      expect(touchTransactionContext).toEqual(expect.objectContaining({
        endTimestamp: expect.any(Number),
        op: 'mocked.op',
        sampled: true,
      }));
      expect(gestureTransactionContext).toEqual(expect.objectContaining({
        endTimestamp: expect.any(Number),
        op: UI_ACTION_GESTURE,
      }));
    });

    it('gesture original on begin handler is called', () => {
      const originalOnBegin = mockedGesture.handlers?.onBegin;
      traceGesture('mockedGesture', mockedGesture, { getCurrentHub: () => mockedHub });
      mockedGesture.handlers!.onBegin!();
      jest.runAllTimers();

      expect(originalOnBegin).toHaveBeenCalledTimes(1);
    });

    it('creates gesture on begin handled if non exists', () => {
      delete mockedGesture.handlers?.onBegin;
      traceGesture('mockedGesture', mockedGesture, { getCurrentHub: () => mockedHub });
      mockedGesture.handlers!.onBegin!();
      jest.runAllTimers();

      expect(mockedGesture.handlers?.onBegin).toBeDefined();
    });
  });
});
