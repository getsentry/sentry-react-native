import type { Breadcrumb } from '@sentry/core';
import { getActiveSpan, spanToJSON, startSpan } from '@sentry/core';

import { UI_ACTION } from '../../src/js/tracing';
import {
  DEFAULT_BREADCRUMB_CATEGORY as DEFAULT_GESTURE_BREADCRUMB_CATEGORY,
  DEFAULT_BREADCRUMB_TYPE as DEFAULT_GESTURE_BREADCRUMB_TYPE,
  sentryTraceGesture,
} from '../../src/js/tracing/gesturetracing';
import { startUserInteractionSpan } from '../../src/js/tracing/integrations/userInteraction';
import { SPAN_ORIGIN_AUTO_INTERACTION } from '../../src/js/tracing/origin';
import type { ReactNativeTracingIntegration } from '../../src/js/tracing/reactnativetracing';
import { reactNativeTracingIntegration } from '../../src/js/tracing/reactnativetracing';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../src/js/tracing/semanticAttributes';
import { type TestClient, setupTestClient } from '../mocks/client';

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
      const gesture: unknown = undefined;
      expect(sentryTraceGesture(label, gesture)).toBeUndefined();
    });

    it('gesture has no handlers', () => {
      const gesture = {};
      expect(sentryTraceGesture(label, gesture)).toEqual({});
    });
  });

  describe('traces gestures', () => {
    let client: TestClient;
    let tracing: ReactNativeTracingIntegration;
    let mockedGesture: MockGesture;

    beforeEach(() => {
      jest.clearAllMocks();
      jest.useFakeTimers();
      client = setupTestClient({
        enableUserInteractionTracing: true,
      });
      tracing = reactNativeTracingIntegration();
      client.addIntegration(tracing);
      tracing.setCurrentRoute('mockedScreenName');
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
      sentryTraceGesture('mockedGesture', mockedGesture);
      mockedGesture.handlers!.onBegin!();
      const transaction = getActiveSpan();
      jest.runAllTimers();

      expect(transaction).toBeDefined();
      expect(spanToJSON(transaction!)).toEqual(
        expect.objectContaining({
          timestamp: expect.any(Number),
          op: `${UI_ACTION}.mock`,
          data: expect.objectContaining({
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_INTERACTION,
          }),
        }),
      );
    });

    it('gesture interaction transaction falls back on invalid handler name', () => {
      mockedGesture.handlerName = 'Invalid';
      sentryTraceGesture('mockedGesture', mockedGesture);
      mockedGesture.handlers!.onBegin!();
      const transaction = getActiveSpan();
      jest.runAllTimers();

      expect(transaction).toBeDefined();
      expect(spanToJSON(transaction!)).toEqual(
        expect.objectContaining({
          timestamp: expect.any(Number),
          op: `${UI_ACTION}.gesture`,
          data: expect.objectContaining({
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_INTERACTION,
          }),
        }),
      );
    });

    it('gesture cancel previous interaction transaction', async () => {
      const timeoutCloseToActualIdleTimeoutMs = 800;

      sentryTraceGesture('mockedGesture', mockedGesture);

      const mockedTouchInteractionId = { elementId: 'mockedElementId', op: 'mocked.op' };
      startUserInteractionSpan(mockedTouchInteractionId);
      startChildSpan();
      await jest.advanceTimersByTimeAsync(timeoutCloseToActualIdleTimeoutMs);

      mockedGesture.handlers?.onBegin?.();
      startChildSpan();

      await jest.advanceTimersByTimeAsync(timeoutCloseToActualIdleTimeoutMs);
      await jest.runAllTimersAsync();

      const touchTransactionEvent = client.eventQueue[0];
      const gestureTransactionEvent = client.eventQueue[1];
      expect(touchTransactionEvent).toEqual(
        expect.objectContaining({
          timestamp: expect.any(Number),
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              op: 'mocked.op',
            }),
          }),
        }),
      );
      expect(gestureTransactionEvent).toEqual(
        expect.objectContaining({
          timestamp: expect.any(Number),
        }),
      );
    });

    it('gesture original on begin handler is called', () => {
      const original = mockedGesture.handlers?.onBegin;
      sentryTraceGesture('mockedGesture', mockedGesture);
      mockedGesture.handlers!.onBegin!();
      jest.runAllTimers();

      expect(original).toHaveBeenCalledTimes(1);
    });

    it('creates gesture on begin handled if non exists', () => {
      delete mockedGesture.handlers?.onBegin;
      sentryTraceGesture('mockedGesture', mockedGesture);
      mockedGesture.handlers!.onBegin!();
      jest.runAllTimers();

      expect(mockedGesture.handlers?.onBegin).toBeDefined();
    });

    it('gesture original on end handler is called', () => {
      const original = mockedGesture.handlers?.onEnd;
      sentryTraceGesture('mockedGesture', mockedGesture);
      mockedGesture.handlers!.onEnd!();
      jest.runAllTimers();

      expect(original).toHaveBeenCalledTimes(1);
    });

    it('creates gesture on end handled if non exists', () => {
      delete mockedGesture.handlers?.onEnd;
      sentryTraceGesture('mockedGesture', mockedGesture);
      mockedGesture.handlers!.onEnd!();
      jest.runAllTimers();

      expect(mockedGesture.handlers?.onBegin).toBeDefined();
    });

    it('creates gesture on begin handled if non exists', () => {
      delete mockedGesture.handlers?.onBegin;
      sentryTraceGesture('mockedGesture', mockedGesture);
      mockedGesture.handlers!.onBegin!();
      jest.runAllTimers();

      expect(mockedGesture.handlers?.onBegin).toBeDefined();
    });

    it('wrapped gesture creates breadcrumb on begin', async () => {
      sentryTraceGesture('mockedGesture', mockedGesture);
      mockedGesture.handlers!.onBegin!();
      startChildSpan();

      await jest.runAllTimersAsync();

      expect(client.event).toEqual(
        expect.objectContaining({
          breadcrumbs: expect.arrayContaining([
            expect.objectContaining(<Breadcrumb>{
              category: DEFAULT_GESTURE_BREADCRUMB_CATEGORY,
              type: DEFAULT_GESTURE_BREADCRUMB_TYPE,
              level: 'info',
            }),
          ]),
        }),
      );
    });

    it('wrapped gesture creates breadcrumb on end', async () => {
      sentryTraceGesture('mockedGesture', mockedGesture);
      mockedGesture.handlers!.onEnd!();
      startChildSpan();

      await jest.runAllTimersAsync();

      expect(client.event).toEqual(
        expect.objectContaining({
          breadcrumbs: expect.arrayContaining([
            expect.objectContaining(<Breadcrumb>{
              category: DEFAULT_GESTURE_BREADCRUMB_CATEGORY,
              type: DEFAULT_GESTURE_BREADCRUMB_TYPE,
              level: 'info',
            }),
          ]),
        }),
      );
    });

    it('wrapped gesture creates breadcrumb only with selected event keys', async () => {
      sentryTraceGesture('mockedGesture', mockedGesture);
      mockedGesture.handlers!.onBegin!({ notSelectedKey: 'notSelectedValue', scale: 1 });
      startChildSpan();

      await jest.runAllTimersAsync();

      expect(client.event).toEqual(
        expect.objectContaining({
          breadcrumbs: expect.arrayContaining([
            expect.objectContaining(<Breadcrumb>{
              data: {
                scale: 1,
                gesture: 'mock',
              },
            }),
          ]),
        }),
      );
    });
  });
});

function startChildSpan() {
  startSpan({ name: 'child', op: 'child.op' }, () => {});
}
