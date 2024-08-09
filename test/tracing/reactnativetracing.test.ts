jest.mock('@sentry/utils', () => {
  const originalUtils = jest.requireActual('@sentry/utils');

  return {
    ...originalUtils,
    timestampInSeconds: jest.fn(originalUtils.timestampInSeconds),
  };
});

import * as SentryBrowser from '@sentry/browser';
import type { Event } from '@sentry/types';

import { RoutingInstrumentation } from '../../src/js/tracing/routingInstrumentation';

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

import { getActiveSpan, spanToJSON } from '@sentry/browser';
import type { AppState, AppStateStatus } from 'react-native';

import { reactNativeTracingIntegration } from '../../src/js/tracing/reactnativetracing';
import { NATIVE } from '../../src/js/wrapper';
import type { TestClient } from '../mocks/client';
import { setupTestClient } from '../mocks/client';

describe('ReactNativeTracing', () => {
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
        expect.objectContaining({
          tracePropagationTargets: ['localhost', /^\/(?!\/)/],
        }),
      );
    });
  });

  describe('Tracing Instrumentation', () => {
    let client: TestClient;

    beforeEach(() => {
      client = setupTestClient();
    });

    describe('With routing instrumentation', () => {
      it('Cancels route transaction when app goes to background', async () => {
        const routingInstrumentation = new RoutingInstrumentation();
        const integration = reactNativeTracingIntegration({
          routingInstrumentation,
        });

        integration.setup(client);
        integration.afterAllSetup(client);
        // wait for internal promises to resolve, fetch app start data from mocked native
        await Promise.resolve();

        const routeTransaction = routingInstrumentation.onRouteWillChange({
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

        const routingInstrumentation = new RoutingInstrumentation();
        setupTestClient({
          integrations: [
            reactNativeTracingIntegration({
              routingInstrumentation,
            }),
          ],
        });

        routingInstrumentation.onRouteWillChange({
          name: 'test',
        });

        await jest.advanceTimersByTimeAsync(500);
        const transaction = getActiveSpan();

        jest.runAllTimers();

        expect(spanToJSON(transaction!).timestamp).toBeDefined();
      });
    });
  });

  describe('Routing Instrumentation', () => {
    let client: TestClient;

    beforeEach(() => {
      client = setupTestClient();
    });

    describe('_onConfirmRoute', () => {
      it('Sets app context', async () => {
        const routing = new RoutingInstrumentation();
        const integration = reactNativeTracingIntegration({
          routingInstrumentation: routing,
        });

        client.addIntegration(integration);

        routing.onRouteWillChange({ name: 'First Route' });
        await jest.advanceTimersByTimeAsync(500);
        await jest.runOnlyPendingTimersAsync();

        routing.onRouteWillChange({ name: 'Second Route' });
        await jest.advanceTimersByTimeAsync(500);
        await jest.runOnlyPendingTimersAsync();

        const transaction = client.event;
        expect(transaction!.contexts!.app).toBeDefined();
        expect(transaction!.contexts!.app!['view_names']).toEqual(['Second Route']);
      });

      describe('View Names event processor', () => {
        it('Do not overwrite event app context', () => {
          const routing = new RoutingInstrumentation();
          const integration = reactNativeTracingIntegration({
            routingInstrumentation: routing,
          });

          const expectedRouteName = 'Route';
          const event: Event = { contexts: { app: { appKey: 'value' } } };
          const expectedEvent: Event = { contexts: { app: { appKey: 'value', view_names: [expectedRouteName] } } };

          integration.state.currentRoute = expectedRouteName;
          const processedEvent = integration.processEvent(event, {}, client);

          expect(processedEvent).toEqual(expectedEvent);
        });

        it('Do not add view_names if context is undefined', () => {
          const routing = new RoutingInstrumentation();
          const integration = reactNativeTracingIntegration({
            routingInstrumentation: routing,
          });

          const expectedRouteName = 'Route';
          const event: Event = { release: 'value' };
          const expectedEvent: Event = { release: 'value' };

          integration.state.currentRoute = expectedRouteName;
          const processedEvent = integration.processEvent(event, {}, client);

          expect(processedEvent).toEqual(expectedEvent);
        });

        it('ignore view_names if undefined', () => {
          const routing = new RoutingInstrumentation();
          const integration = reactNativeTracingIntegration({
            routingInstrumentation: routing,
          });

          const event: Event = { contexts: { app: { key: 'value ' } } };
          const expectedEvent: Event = { contexts: { app: { key: 'value ' } } };

          const processedEvent = integration.processEvent(event, {}, client);

          expect(processedEvent).toEqual(expectedEvent);
        });
      });
    });
  });
});
