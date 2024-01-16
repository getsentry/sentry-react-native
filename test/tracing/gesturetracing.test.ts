import { BrowserClient } from '@sentry/browser';
import type { BrowserClientOptions } from '@sentry/browser/types/client';
import { Hub } from '@sentry/core';
import type { IntegrationIndex } from '@sentry/core/types/integration';
import type { Breadcrumb, Scope, Transaction, User } from '@sentry/types';

import { UI_ACTION } from '../../src/js/tracing';
import {
  DEFAULT_BREADCRUMB_CATEGORY as DEFAULT_GESTURE_BREADCRUMB_CATEGORY,
  DEFAULT_BREADCRUMB_TYPE as DEFAULT_GESTURE_BREADCRUMB_TYPE,
  sentryTraceGesture,
} from '../../src/js/tracing/gesturetracing';
import { ReactNativeTracing } from '../../src/js/tracing/reactnativetracing';
import type { MockedRoutingInstrumentation } from './mockedrountinginstrumention';
import {
  createMockedRoutingInstrumentation,
  mockedConfirmedRouteTransactionContext,
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
    setContext(_context: unknown) {
      // Placeholder
    },
    addBreadcrumb(_breadcrumb: unknown) {
      // Placeholder
    },
    getUser: () => scopeUser,
  };
};

const mockAddBreadcrumb = jest.fn();

const getMockHub = () => {
  const mockHub = new Hub(new BrowserClient({ tracesSampleRate: 1 } as BrowserClientOptions));
  const mockScope = getMockScope();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockHub.getScope = () => mockScope as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockHub.configureScope = jest.fn(callback => callback(mockScope as any));

  mockHub.addBreadcrumb = mockAddBreadcrumb;

  return mockHub;
};

interface MockGesture {
  handlers?: {
    onBegin?: jest.Mock;
    onEnd?: jest.Mock;
  };
  handlerName: string;
}

describe('GestureTracing', () => {
  const label = 'testGesture';

  describe('gracefully fails on invalid gestures', () => {
    it('gesture is undefined', () => {
      const gesture = undefined;
      expect(sentryTraceGesture(label, gesture)).toBeUndefined();
    });

    it('gesture has no handlers', () => {
      const gesture = {};
      expect(sentryTraceGesture(label, gesture)).toEqual({});
    });
  });

  describe('traces gestures', () => {
    let mockedScope: Scope;
    let mockedHub: Hub;
    let tracing: ReactNativeTracing;
    let mockedRoutingInstrumentation: MockedRoutingInstrumentation;
    let mockedGesture: MockGesture;

    beforeEach(() => {
      jest.clearAllMocks();
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
      (mockedHub.getClient() as unknown as { _integrations: IntegrationIndex })._integrations[ReactNativeTracing.name] =
        tracing;
      mockedRoutingInstrumentation.registeredOnConfirmRoute!(mockedConfirmedRouteTransactionContext);
      mockedGesture = {
        handlers: {
          onBegin: jest.fn(),
          onEnd: jest.fn(),
        },
        handlerName: 'MockGestureHandler',
      };
    });

    afterEach(() => {
      jest.runAllTimers();
      jest.useRealTimers();
    });

    it('gesture creates interaction transaction', () => {
      sentryTraceGesture('mockedGesture', mockedGesture, { getCurrentHub: () => mockedHub });
      mockedGesture.handlers!.onBegin!();
      const transaction = mockedScope.getTransaction() as Transaction | undefined;
      jest.runAllTimers();

      const transactionContext = transaction?.toContext();
      expect(transactionContext).toEqual(
        expect.objectContaining({
          endTimestamp: expect.any(Number),
          op: `${UI_ACTION}.mock`,
        }),
      );
    });

    it('gesture interaction transaction falls back on invalid handler name', () => {
      mockedGesture.handlerName = 'Invalid';
      sentryTraceGesture('mockedGesture', mockedGesture, { getCurrentHub: () => mockedHub });
      mockedGesture.handlers!.onBegin!();
      const transaction = mockedScope.getTransaction() as Transaction | undefined;
      jest.runAllTimers();

      const transactionContext = transaction?.toContext();
      expect(transactionContext).toEqual(
        expect.objectContaining({
          endTimestamp: expect.any(Number),
          op: `${UI_ACTION}.gesture`,
        }),
      );
    });

    it('gesture cancel previous interaction transaction', () => {
      const timeoutCloseToActualIdleTimeoutMs = 800;

      sentryTraceGesture('mockedGesture', mockedGesture, { getCurrentHub: () => mockedHub });

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
      expect(touchTransactionContext).toEqual(
        expect.objectContaining({
          endTimestamp: expect.any(Number),
          op: 'mocked.op',
          sampled: true,
        }),
      );
      expect(gestureTransactionContext).toEqual(
        expect.objectContaining({
          endTimestamp: expect.any(Number),
        }),
      );
    });

    it('gesture original on begin handler is called', () => {
      const original = mockedGesture.handlers?.onBegin;
      sentryTraceGesture('mockedGesture', mockedGesture, { getCurrentHub: () => mockedHub });
      mockedGesture.handlers!.onBegin!();
      jest.runAllTimers();

      expect(original).toHaveBeenCalledTimes(1);
    });

    it('creates gesture on begin handled if non exists', () => {
      delete mockedGesture.handlers?.onBegin;
      sentryTraceGesture('mockedGesture', mockedGesture, { getCurrentHub: () => mockedHub });
      mockedGesture.handlers!.onBegin!();
      jest.runAllTimers();

      expect(mockedGesture.handlers?.onBegin).toBeDefined();
    });

    it('gesture original on end handler is called', () => {
      const original = mockedGesture.handlers?.onEnd;
      sentryTraceGesture('mockedGesture', mockedGesture, { getCurrentHub: () => mockedHub });
      mockedGesture.handlers!.onEnd!();
      jest.runAllTimers();

      expect(original).toHaveBeenCalledTimes(1);
    });

    it('creates gesture on end handled if non exists', () => {
      delete mockedGesture.handlers?.onEnd;
      sentryTraceGesture('mockedGesture', mockedGesture, { getCurrentHub: () => mockedHub });
      mockedGesture.handlers!.onEnd!();
      jest.runAllTimers();

      expect(mockedGesture.handlers?.onBegin).toBeDefined();
    });

    it('creates gesture on begin handled if non exists', () => {
      delete mockedGesture.handlers?.onBegin;
      sentryTraceGesture('mockedGesture', mockedGesture, { getCurrentHub: () => mockedHub });
      mockedGesture.handlers!.onBegin!();
      jest.runAllTimers();

      expect(mockedGesture.handlers?.onBegin).toBeDefined();
    });

    it('wrapped gesture creates breadcrumb on begin', () => {
      sentryTraceGesture('mockedGesture', mockedGesture, { getCurrentHub: () => mockedHub });
      mockedGesture.handlers!.onBegin!();
      jest.runAllTimers();

      expect(mockAddBreadcrumb).toHaveBeenCalledTimes(1);
      expect(mockAddBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining(<Breadcrumb>{
          category: DEFAULT_GESTURE_BREADCRUMB_CATEGORY,
          type: DEFAULT_GESTURE_BREADCRUMB_TYPE,
          level: 'info',
        }),
      );
    });

    it('wrapped gesture creates breadcrumb on end', () => {
      sentryTraceGesture('mockedGesture', mockedGesture, { getCurrentHub: () => mockedHub });
      mockedGesture.handlers!.onEnd!();
      jest.runAllTimers();

      expect(mockAddBreadcrumb).toHaveBeenCalledTimes(1);
      expect(mockAddBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining(<Breadcrumb>{
          category: DEFAULT_GESTURE_BREADCRUMB_CATEGORY,
          type: DEFAULT_GESTURE_BREADCRUMB_TYPE,
          level: 'info',
        }),
      );
    });

    it('wrapped gesture creates breadcrumb only with selected event keys', () => {
      sentryTraceGesture('mockedGesture', mockedGesture, { getCurrentHub: () => mockedHub });
      mockedGesture.handlers!.onBegin!({ notSelectedKey: 'notSelectedValue', scale: 1 });
      jest.runAllTimers();

      expect(mockAddBreadcrumb).toHaveBeenCalledTimes(1);
      expect(mockAddBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining(<Breadcrumb>{
          data: {
            scale: 1,
            gesture: 'mock',
          },
        }),
      );
    });
  });
});
