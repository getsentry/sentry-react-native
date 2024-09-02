jest.mock('@sentry/utils', () => {
  const originalUtils = jest.requireActual('@sentry/utils');

  return {
    ...originalUtils,
    timestampInSeconds: jest.fn(originalUtils.timestampInSeconds),
  };
});

import * as SentryBrowser from '@sentry/browser';
import type { Event } from '@sentry/types';

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

jest.mock('../../src/js/tracing/utils', () => {
  const originalUtils = jest.requireActual('../../src/js/tracing/utils');

  return {
    ...originalUtils,
    getTimeOriginMilliseconds: jest.fn(),
  };
});

import { reactNativeTracingIntegration } from '../../src/js/tracing/reactnativetracing';
import type { TestClient } from '../mocks/client';
import { setupTestClient } from '../mocks/client';

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

      expect(instrumentOutgoingRequests).toBeCalledWith(
        expect.anything(),
        expect.objectContaining({
          tracePropagationTargets: ['test1', 'test2'],
        }),
      );
    });

    it('uses defaults', () => {
      const instrumentOutgoingRequests = jest.spyOn(SentryBrowser, 'instrumentOutgoingRequests');
      setupTestClient({
        enableStallTracking: false,
        integrations: [reactNativeTracingIntegration()],
      });

      expect(instrumentOutgoingRequests).toBeCalledWith(
        expect.anything(),
        expect.objectContaining({
          tracePropagationTargets: ['localhost', /^\/(?!\/)/],
        }),
      );
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
});
