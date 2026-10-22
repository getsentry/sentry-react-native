import type { Event } from '@sentry/core';

import * as SentryBrowser from '@sentry/browser';

jest.mock('../../src/js/wrapper', () => {
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

import type { TestClient } from '../mocks/client';

import { reactNativeTracingIntegration } from '../../src/js/tracing/reactnativetracing';
import { isExpoFetchEnabled, isResourceTimingSupported, isWeb } from '../../src/js/utils/environment';
import { setupTestClient } from '../mocks/client';

jest.mock('../../src/js/tracing/utils', () => {
  const originalUtils = jest.requireActual('../../src/js/tracing/utils');

  return {
    ...originalUtils,
    getTimeOriginMilliseconds: jest.fn(),
  };
});

jest.mock('@sentry/core', () => {
  const originalUtils = jest.requireActual('@sentry/core');

  return {
    ...originalUtils,
    timestampInSeconds: jest.fn(originalUtils.timestampInSeconds),
  };
});

jest.mock('../../src/js/utils/environment');

describe('ReactNativeTracing', () => {
  let client: TestClient;

  beforeEach(() => {
    jest.useFakeTimers();
    client = setupTestClient();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('trace propagation targets', () => {
    it('uses tracePropagationTargets from client options', () => {
      const instrumentOutgoingRequests = jest.spyOn(SentryBrowser, 'instrumentOutgoingRequests');
      setupTestClient({
        tracePropagationTargets: ['test1', 'test2'],
        enableStallTracking: false,
        integrations: [reactNativeTracingIntegration()],
      });

      expect(instrumentOutgoingRequests).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          tracePropagationTargets: ['test1', 'test2'],
        }),
      );
    });

    it('uses mobile defaults', () => {
      (isWeb as jest.MockedFunction<typeof isWeb>).mockReturnValue(false);
      const instrumentOutgoingRequests = jest.spyOn(SentryBrowser, 'instrumentOutgoingRequests');
      setupTestClient({
        enableStallTracking: false,
        integrations: [reactNativeTracingIntegration()],
      });

      expect(instrumentOutgoingRequests).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          tracePropagationTargets: [/.*/],
        }),
      );
    });

    it('uses web defaults', () => {
      (isWeb as jest.MockedFunction<typeof isWeb>).mockReturnValue(true);
      const instrumentOutgoingRequests = jest.spyOn(SentryBrowser, 'instrumentOutgoingRequests');
      setupTestClient({
        enableStallTracking: false,
        integrations: [reactNativeTracingIntegration()],
      });

      expect(instrumentOutgoingRequests).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          tracePropagationTargets: undefined,
        }),
      );
    });
  });

  describe('traceFetch default', () => {
    it('disables fetch tracing on mobile without expo/fetch', () => {
      (isWeb as jest.MockedFunction<typeof isWeb>).mockReturnValue(false);
      (isExpoFetchEnabled as jest.MockedFunction<typeof isExpoFetchEnabled>).mockReturnValue(false);
      const instrumentOutgoingRequests = jest.spyOn(SentryBrowser, 'instrumentOutgoingRequests');
      setupTestClient({
        enableStallTracking: false,
        integrations: [reactNativeTracingIntegration()],
      });

      expect(instrumentOutgoingRequests).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          traceFetch: false,
          traceXHR: true,
        }),
      );
    });

    it('enables fetch tracing when expo/fetch is active', () => {
      (isWeb as jest.MockedFunction<typeof isWeb>).mockReturnValue(false);
      (isExpoFetchEnabled as jest.MockedFunction<typeof isExpoFetchEnabled>).mockReturnValue(true);
      const instrumentOutgoingRequests = jest.spyOn(SentryBrowser, 'instrumentOutgoingRequests');
      setupTestClient({
        enableStallTracking: false,
        integrations: [reactNativeTracingIntegration()],
      });

      expect(instrumentOutgoingRequests).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ traceFetch: true, traceXHR: false }),
      );
      expect(instrumentOutgoingRequests).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ traceFetch: false, traceXHR: true }),
      );
    });

    it('enables fetch tracing on web', () => {
      (isWeb as jest.MockedFunction<typeof isWeb>).mockReturnValue(true);
      (isExpoFetchEnabled as jest.MockedFunction<typeof isExpoFetchEnabled>).mockReturnValue(false);
      const instrumentOutgoingRequests = jest.spyOn(SentryBrowser, 'instrumentOutgoingRequests');
      setupTestClient({
        enableStallTracking: false,
        integrations: [reactNativeTracingIntegration()],
      });

      expect(instrumentOutgoingRequests).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          traceFetch: true,
        }),
      );
    });

    it('respects explicit user option over defaults', () => {
      (isWeb as jest.MockedFunction<typeof isWeb>).mockReturnValue(false);
      (isExpoFetchEnabled as jest.MockedFunction<typeof isExpoFetchEnabled>).mockReturnValue(true);
      const instrumentOutgoingRequests = jest.spyOn(SentryBrowser, 'instrumentOutgoingRequests');
      setupTestClient({
        enableStallTracking: false,
        integrations: [reactNativeTracingIntegration({ traceFetch: false })],
      });

      expect(instrumentOutgoingRequests).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          traceFetch: false,
        }),
      );
    });
  });

  describe('enableHTTPTimings default', () => {
    const fetchCall = (enableHTTPTimings: boolean): unknown =>
      expect.objectContaining({ traceFetch: true, traceXHR: false, enableHTTPTimings });
    const xhrCall = (enableHTTPTimings: boolean): unknown =>
      expect.objectContaining({ traceFetch: false, traceXHR: true, enableHTTPTimings });

    const mockEnvironment = ({
      web = false,
      resourceTiming,
      expoFetch,
    }: {
      web?: boolean;
      resourceTiming: boolean;
      expoFetch: boolean;
    }): void => {
      (isWeb as jest.MockedFunction<typeof isWeb>).mockReturnValue(web);
      (isResourceTimingSupported as jest.MockedFunction<typeof isResourceTimingSupported>).mockReturnValue(
        resourceTiming,
      );
      (isExpoFetchEnabled as jest.MockedFunction<typeof isExpoFetchEnabled>).mockReturnValue(expoFetch);
    };

    it('enables HTTP timings for fetch and XHR on web', () => {
      mockEnvironment({ web: true, resourceTiming: false, expoFetch: false });
      const instrumentOutgoingRequests = jest.spyOn(SentryBrowser, 'instrumentOutgoingRequests');

      setupTestClient({
        enableStallTracking: false,
        integrations: [reactNativeTracingIntegration()],
      });

      expect(instrumentOutgoingRequests).toHaveBeenCalledWith(expect.anything(), fetchCall(true));
      expect(instrumentOutgoingRequests).toHaveBeenCalledWith(expect.anything(), xhrCall(true));
    });

    it('enables HTTP timings for XHR on mobile when resource timing is supported', () => {
      mockEnvironment({ resourceTiming: true, expoFetch: false });
      const instrumentOutgoingRequests = jest.spyOn(SentryBrowser, 'instrumentOutgoingRequests');

      setupTestClient({
        enableStallTracking: false,
        integrations: [reactNativeTracingIntegration()],
      });

      expect(instrumentOutgoingRequests).toHaveBeenCalledWith(expect.anything(), xhrCall(true));
    });

    it('disables HTTP timings for XHR on mobile when resource timing is not supported', () => {
      mockEnvironment({ resourceTiming: false, expoFetch: false });
      const instrumentOutgoingRequests = jest.spyOn(SentryBrowser, 'instrumentOutgoingRequests');

      setupTestClient({
        enableStallTracking: false,
        integrations: [reactNativeTracingIntegration()],
      });

      expect(instrumentOutgoingRequests).toHaveBeenCalledWith(expect.anything(), xhrCall(false));
    });

    it('disables HTTP timings for expo/fetch and keeps them for XHR when resource timing is supported', () => {
      mockEnvironment({ resourceTiming: true, expoFetch: true });
      const instrumentOutgoingRequests = jest.spyOn(SentryBrowser, 'instrumentOutgoingRequests');

      setupTestClient({
        enableStallTracking: false,
        integrations: [reactNativeTracingIntegration()],
      });

      expect(instrumentOutgoingRequests).toHaveBeenCalledWith(expect.anything(), fetchCall(false));
      expect(instrumentOutgoingRequests).toHaveBeenCalledWith(expect.anything(), xhrCall(true));
    });

    it('disables HTTP timings for expo/fetch and XHR when resource timing is not supported', () => {
      mockEnvironment({ resourceTiming: false, expoFetch: true });
      const instrumentOutgoingRequests = jest.spyOn(SentryBrowser, 'instrumentOutgoingRequests');

      setupTestClient({
        enableStallTracking: false,
        integrations: [reactNativeTracingIntegration()],
      });

      expect(instrumentOutgoingRequests).toHaveBeenCalledWith(expect.anything(), fetchCall(false));
      expect(instrumentOutgoingRequests).toHaveBeenCalledWith(expect.anything(), xhrCall(false));
    });

    it.each([true, false])('applies the explicit user option %s to fetch and XHR', enableHTTPTimings => {
      mockEnvironment({ resourceTiming: !enableHTTPTimings, expoFetch: !enableHTTPTimings });
      const instrumentOutgoingRequests = jest.spyOn(SentryBrowser, 'instrumentOutgoingRequests');

      setupTestClient({
        enableStallTracking: false,
        integrations: [reactNativeTracingIntegration({ enableHTTPTimings, traceFetch: true })],
      });

      expect(instrumentOutgoingRequests).toHaveBeenCalledWith(expect.anything(), fetchCall(enableHTTPTimings));
      expect(instrumentOutgoingRequests).toHaveBeenCalledWith(expect.anything(), xhrCall(enableHTTPTimings));
    });
  });

  describe('View Names event processor', () => {
    it('Do not overwrite event app context', () => {
      const integration = reactNativeTracingIntegration();

      const expectedRouteName = 'Route';
      const event: Event = { contexts: { app: { appKey: 'value' } } };
      const expectedEvent: Event = { contexts: { app: { appKey: 'value', view_names: [expectedRouteName] } } };

      integration.setCurrentRoute(expectedRouteName);
      const processedEvent = integration.processEvent(event, {}, client);

      expect(processedEvent).toEqual(expectedEvent);
    });

    it('Do not add view_names if context is undefined', () => {
      const integration = reactNativeTracingIntegration();

      const expectedRouteName = 'Route';
      const event: Event = { release: 'value' };
      const expectedEvent: Event = { release: 'value' };

      integration.setCurrentRoute(expectedRouteName);
      const processedEvent = integration.processEvent(event, {}, client);

      expect(processedEvent).toEqual(expectedEvent);
    });

    it('ignore view_names if undefined', () => {
      const integration = reactNativeTracingIntegration();

      const event: Event = { contexts: { app: { key: 'value ' } } };
      const expectedEvent: Event = { contexts: { app: { key: 'value ' } } };

      const processedEvent = integration.processEvent(event, {}, client);

      expect(processedEvent).toEqual(expectedEvent);
    });
  });

  describe('discarded transaction event processor', () => {
    it('drops transaction events marked with the discard reason attribute', () => {
      const integration = reactNativeTracingIntegration();
      const recordDroppedEvent = jest.spyOn(client, 'recordDroppedEvent');

      const event: Event = {
        type: 'transaction',
        contexts: {
          trace: {
            trace_id: 'a'.repeat(32),
            span_id: 'b'.repeat(16),
            data: { 'sentry.rn.discard_reason': 'no_route_info' },
          },
        },
      };

      const processedEvent = integration.processEvent(event, {}, client);

      expect(processedEvent).toBeNull();
      // `@sentry/core` records the `event_processor` drop automatically when
      // a processor returns `null`, so the integration must not call
      // `recordDroppedEvent` itself (would double-count in client reports).
      expect(recordDroppedEvent).not.toHaveBeenCalled();
    });

    it('does not drop transaction events without the discard reason attribute', () => {
      const integration = reactNativeTracingIntegration();
      const recordDroppedEvent = jest.spyOn(client, 'recordDroppedEvent');

      const event: Event = {
        type: 'transaction',
        contexts: {
          trace: {
            trace_id: 'a'.repeat(32),
            span_id: 'b'.repeat(16),
            data: { 'route.name': 'Home' },
          },
        },
      };

      const processedEvent = integration.processEvent(event, {}, client);

      expect(processedEvent).not.toBeNull();
      expect(recordDroppedEvent).not.toHaveBeenCalled();
    });

    it('does not drop non-transaction events even if marked', () => {
      const integration = reactNativeTracingIntegration();
      const recordDroppedEvent = jest.spyOn(client, 'recordDroppedEvent');

      // Errors should never carry this attribute, but the processor should
      // still pass them through unchanged if they happen to.
      const event: Event = {
        contexts: {
          trace: {
            trace_id: 'a'.repeat(32),
            span_id: 'b'.repeat(16),
            data: { 'sentry.rn.discard_reason': 'no_route_info' },
          },
        },
      };

      const processedEvent = integration.processEvent(event, {}, client);

      expect(processedEvent).not.toBeNull();
      expect(recordDroppedEvent).not.toHaveBeenCalled();
    });
  });
});
