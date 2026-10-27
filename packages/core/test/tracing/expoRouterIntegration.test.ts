import type { Client } from '@sentry/core';

import { INTEGRATION_NAME as REACT_NAVIGATION_INTEGRATION_NAME } from '../../src/js/tracing/reactnavigation';
import { RN_GLOBAL_OBJ } from '../../src/js/utils/worldwide';

const EXPO_ROUTER_ROUTE_INFO_MODULE = 'expo-router/build/global-state/getRouteInfoFromState';
const EXPO_ROUTER_NAVIGATION_EVENTS_MODULE = 'expo-router/build/global-state/internalNavigationEvents';

function mockExpoRouter(navigationRef: unknown, getRouteInfoFromState: (state: unknown) => unknown = jest.fn()): void {
  jest.doMock('expo-router', () => ({ useNavigationContainerRef: () => navigationRef }), { virtual: true });
  jest.doMock(EXPO_ROUTER_ROUTE_INFO_MODULE, () => ({ getRouteInfoFromState }), { virtual: true });
}

interface MockNavigationContainer {
  addListener: jest.Mock;
  getCurrentRoute: jest.Mock;
  getState: jest.Mock;
}

function createMockNavigationContainer(): MockNavigationContainer {
  return {
    addListener: jest.fn(),
    getCurrentRoute: jest.fn(() => ({ key: 'k', name: 'Route' })),
    getState: jest.fn(() => undefined),
  };
}

function createMockClient(): {
  client: Client;
  addIntegration: jest.Mock;
  getIntegrationByName: jest.Mock;
  on: jest.Mock;
  closeHandlers: Array<() => void>;
} {
  const closeHandlers: Array<() => void> = [];
  const addIntegration = jest.fn();
  const getIntegrationByName = jest.fn().mockReturnValue(undefined);
  const on = jest.fn((event: string, cb: () => void) => {
    if (event === 'close') closeHandlers.push(cb);
  });
  const client = {
    addIntegration,
    getIntegrationByName,
    on,
  } as unknown as Client;
  return { client, addIntegration, getIntegrationByName, on, closeHandlers };
}

describe('expoRouterIntegration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllTimers();
    jest.resetModules();
    RN_GLOBAL_OBJ.__sentry_rn_v5_registered = false;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('expo-router not installed', () => {
    it('is a no-op when require fails', () => {
      // No mock for expo-router — require will throw.
      const { expoRouterIntegration: integration } = require('../../src/js/tracing/expoRouterIntegration');
      const { client, addIntegration } = createMockClient();

      const integ = integration();
      integ.afterAllSetup?.(client);

      expect(integ.name).toBe('ExpoRouter');
      expect(addIntegration).not.toHaveBeenCalled();
    });
  });

  describe('expo-router found but navigationRef missing', () => {
    it('does not add the integration and warns after the timeout', () => {
      mockExpoRouter(undefined);

      const { debug } = require('@sentry/core');
      const warnSpy = jest.spyOn(debug, 'warn').mockImplementation(() => undefined);

      const { expoRouterIntegration: integration } = require('../../src/js/tracing/expoRouterIntegration');
      const { client, addIntegration } = createMockClient();

      const integ = integration();
      integ.afterAllSetup?.(client);

      // No warning yet — we keep polling in case the ref shows up later.
      expect(warnSpy).not.toHaveBeenCalled();
      expect(addIntegration).not.toHaveBeenCalled();

      jest.advanceTimersByTime(6_000);

      expect(addIntegration).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('navigationRef'));

      warnSpy.mockRestore();
    });
  });

  describe('expo-router 56 and 57, navigationRef set when the Root Layout renders', () => {
    it('picks up navigationRef when it appears mid-poll (issue #6431)', () => {
      const container = createMockNavigationContainer();
      const store: { navigationRef?: { current: MockNavigationContainer | null } } = {};
      jest.doMock('expo-router', () => ({ useNavigationContainerRef: () => store.navigationRef }), {
        virtual: true,
      });

      const { expoRouterIntegration: integration } = require('../../src/js/tracing/expoRouterIntegration');
      const { client, addIntegration } = createMockClient();

      const integ = integration();
      integ.afterAllSetup?.(client);

      expect(addIntegration).not.toHaveBeenCalled();

      jest.advanceTimersByTime(200);
      store.navigationRef = { current: null };
      jest.advanceTimersByTime(50);

      // The ref exists but `.current` is still null, so a later timeout must not leave a
      // non-functional integration behind.
      expect(addIntegration).not.toHaveBeenCalled();
      expect(container.addListener).not.toHaveBeenCalled();

      store.navigationRef.current = container;
      jest.advanceTimersByTime(50);

      expect(addIntegration).toHaveBeenCalledTimes(1);
      expect(container.addListener).toHaveBeenCalledWith('__unsafe_action__', expect.any(Function));
      expect(container.addListener).toHaveBeenCalledWith('state', expect.any(Function));
    });
  });

  describe('expo-router 55 and older, getRouteInfoFromState missing', () => {
    it('registers the navigation container without a route override', () => {
      const container = createMockNavigationContainer();
      jest.doMock('expo-router', () => ({ useNavigationContainerRef: () => ({ current: container }) }), {
        virtual: true,
      });
      jest.doMock(
        EXPO_ROUTER_ROUTE_INFO_MODULE,
        () => {
          throw new Error(`Cannot find module '${EXPO_ROUTER_ROUTE_INFO_MODULE}'`);
        },
        { virtual: true },
      );

      const { expoRouterIntegration: integration } = require('../../src/js/tracing/expoRouterIntegration');
      const { client, getIntegrationByName } = createMockClient();
      const registerNavigationContainer = jest.fn();
      const setRouteOverrideProvider = jest.fn();
      getIntegrationByName.mockImplementation((name: string) =>
        name === REACT_NAVIGATION_INTEGRATION_NAME
          ? { name, registerNavigationContainer, _setRouteOverrideProvider: setRouteOverrideProvider }
          : undefined,
      );

      integration().afterAllSetup?.(client);

      expect(registerNavigationContainer).toHaveBeenCalledWith({ current: container });
      const provider = setRouteOverrideProvider.mock.calls[0][0] as () => unknown;
      expect(provider()).toBeUndefined();
    });
  });

  describe('useNavigationContainerRef throws', () => {
    it('keeps polling without throwing and warns after the timeout', () => {
      jest.doMock(
        'expo-router',
        () => ({
          useNavigationContainerRef: () => {
            throw new Error('Invalid hook call');
          },
        }),
        { virtual: true },
      );

      const { debug } = require('@sentry/core');
      const warnSpy = jest.spyOn(debug, 'warn').mockImplementation(() => undefined);

      const { expoRouterIntegration: integration } = require('../../src/js/tracing/expoRouterIntegration');
      const { client, addIntegration } = createMockClient();

      expect(() => {
        integration().afterAllSetup?.(client);
        jest.advanceTimersByTime(6_000);
      }).not.toThrow();

      expect(addIntegration).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('navigationRef'));

      warnSpy.mockRestore();
    });
  });

  describe('expo-router installed, navigationRef pre-populated', () => {
    it('registers the navigation container immediately', () => {
      const container = createMockNavigationContainer();
      mockExpoRouter({ current: container });

      const { expoRouterIntegration: integration } = require('../../src/js/tracing/expoRouterIntegration');
      const { client, addIntegration } = createMockClient();

      const integ = integration();
      integ.afterAllSetup?.(client);

      expect(addIntegration).toHaveBeenCalledTimes(1);
      const added = addIntegration.mock.calls[0][0];
      expect(added.name).toBe(REACT_NAVIGATION_INTEGRATION_NAME);

      expect(container.addListener).toHaveBeenCalledWith('__unsafe_action__', expect.any(Function));
      expect(container.addListener).toHaveBeenCalledWith('state', expect.any(Function));
    });
  });

  describe('expo-router installed, navigationRef populated asynchronously', () => {
    it('polls until ref.current is populated, then registers', () => {
      const container = createMockNavigationContainer();
      const navigationRef: { current: MockNavigationContainer | null } = { current: null };
      mockExpoRouter(navigationRef);

      const { expoRouterIntegration: integration } = require('../../src/js/tracing/expoRouterIntegration');
      const { client, addIntegration } = createMockClient();

      const integ = integration();
      integ.afterAllSetup?.(client);

      // nothing attached yet — .current is still null
      expect(container.addListener).not.toHaveBeenCalled();
      expect(addIntegration).not.toHaveBeenCalled();

      // tick the polling timer once before ref is populated — still no registration
      jest.advanceTimersByTime(50);
      expect(container.addListener).not.toHaveBeenCalled();
      expect(addIntegration).not.toHaveBeenCalled();

      // populate the ref and tick again
      navigationRef.current = container;
      jest.advanceTimersByTime(50);

      expect(addIntegration).toHaveBeenCalledTimes(1);
      expect(container.addListener).toHaveBeenCalledWith('__unsafe_action__', expect.any(Function));
      expect(container.addListener).toHaveBeenCalledWith('state', expect.any(Function));
    });

    it('stops polling after the timeout if ref is never populated', () => {
      const navigationRef: { current: unknown } = { current: null };
      mockExpoRouter(navigationRef);

      const { expoRouterIntegration: integration } = require('../../src/js/tracing/expoRouterIntegration');
      const { client, addIntegration, closeHandlers } = createMockClient();

      const integ = integration();
      integ.afterAllSetup?.(client);
      const timersAfterSetup = jest.getTimerCount();

      jest.advanceTimersByTime(6_000);

      expect(jest.getTimerCount()).toBeLessThan(timersAfterSetup);
      expect(closeHandlers.length).toBe(1);
      // navigationRef existed the whole time but .current never populated — we must
      // not leave a `reactNavigationIntegration` attached that was never registered.
      expect(addIntegration).not.toHaveBeenCalled();
    });
  });

  describe('user already added reactNavigationIntegration', () => {
    it('reuses the existing integration and does not add a duplicate', () => {
      const container = createMockNavigationContainer();
      mockExpoRouter({ current: container });

      const { expoRouterIntegration: integration } = require('../../src/js/tracing/expoRouterIntegration');
      const { client, addIntegration, getIntegrationByName } = createMockClient();

      const existingRegister = jest.fn();
      getIntegrationByName.mockImplementation((name: string) =>
        name === REACT_NAVIGATION_INTEGRATION_NAME
          ? { name, registerNavigationContainer: existingRegister }
          : undefined,
      );

      const integ = integration();
      integ.afterAllSetup?.(client);

      expect(addIntegration).not.toHaveBeenCalled();
      expect(existingRegister).toHaveBeenCalledWith({ current: container });
    });
  });

  describe('route override provider', () => {
    it('derives the route override from the root navigation state', () => {
      const container = createMockNavigationContainer();
      const rootState = { index: 0, routes: [{ name: '(tabs)' }] };
      const getRouteInfoFromState = jest.fn(() => ({
        segments: ['(tabs)', 'profile', '[id]'],
        params: { id: '123', utm_source: 'email' },
        pathnameWithParams: '/profile/123?utm_source=email',
        pathname: '/profile/123',
      }));
      mockExpoRouter({ current: container, getRootState: () => rootState }, getRouteInfoFromState);

      const { expoRouterIntegration: integration } = require('../../src/js/tracing/expoRouterIntegration');
      const { client, getIntegrationByName } = createMockClient();
      const setRouteOverrideProvider = jest.fn();
      getIntegrationByName.mockImplementation((name: string) =>
        name === REACT_NAVIGATION_INTEGRATION_NAME
          ? { name, registerNavigationContainer: jest.fn(), _setRouteOverrideProvider: setRouteOverrideProvider }
          : undefined,
      );

      integration().afterAllSetup?.(client);

      const provider = setRouteOverrideProvider.mock.calls[0][0] as () => unknown;
      expect(provider()).toEqual({
        templatedPath: '/profile/[id]',
        concreteUrl: '/profile/123?utm_source=email',
        params: { id: '123', utm_source: 'email' },
      });
      expect(getRouteInfoFromState).toHaveBeenCalledWith(rootState);
    });

    it('returns no route override before the navigation container mounts', () => {
      const navigationRef: { current: unknown; getRootState: jest.Mock } = {
        current: createMockNavigationContainer(),
        getRootState: jest.fn(),
      };
      const getRouteInfoFromState = jest.fn();
      mockExpoRouter(navigationRef, getRouteInfoFromState);

      const { expoRouterIntegration: integration } = require('../../src/js/tracing/expoRouterIntegration');
      const { client, getIntegrationByName } = createMockClient();
      const setRouteOverrideProvider = jest.fn();
      getIntegrationByName.mockImplementation((name: string) =>
        name === REACT_NAVIGATION_INTEGRATION_NAME
          ? { name, registerNavigationContainer: jest.fn(), _setRouteOverrideProvider: setRouteOverrideProvider }
          : undefined,
      );

      integration().afterAllSetup?.(client);
      navigationRef.current = null;

      const provider = setRouteOverrideProvider.mock.calls[0][0] as () => unknown;
      expect(provider()).toBeUndefined();
      expect(navigationRef.getRootState).not.toHaveBeenCalled();
      expect(getRouteInfoFromState).not.toHaveBeenCalled();
    });
  });

  describe('expo-router 58 navigation actions', () => {
    function setUpWithNavigationEvents(): {
      startIdleNavigationSpan: jest.Mock;
      emit: (event: { actionType?: string; payload?: unknown }) => void;
      removeListener: jest.Mock;
      closeHandlers: Array<() => void>;
    } {
      const listeners: Array<(event: { actionType?: string; payload?: unknown }) => void> = [];
      const removeListener = jest.fn();
      mockExpoRouter({ current: createMockNavigationContainer() });
      jest.doMock(
        EXPO_ROUTER_NAVIGATION_EVENTS_MODULE,
        () => ({
          internalNavigationEvents: {
            addListener: (name: string, callback: (event: { actionType?: string; payload?: unknown }) => void) => {
              if (name === 'actionDispatched') listeners.push(callback);
              return removeListener;
            },
          },
        }),
        { virtual: true },
      );

      const { expoRouterIntegration: integration } = require('../../src/js/tracing/expoRouterIntegration');
      const { client, getIntegrationByName, closeHandlers } = createMockClient();
      const startIdleNavigationSpan = jest.fn();
      getIntegrationByName.mockImplementation((name: string) =>
        name === REACT_NAVIGATION_INTEGRATION_NAME
          ? { name, registerNavigationContainer: jest.fn(), _startIdleNavigationSpan: startIdleNavigationSpan }
          : undefined,
      );

      integration().afterAllSetup?.(client);

      return {
        startIdleNavigationSpan,
        emit: event => listeners.forEach(listener => listener(event)),
        removeListener,
        closeHandlers,
      };
    }

    it('starts a navigation span for each dispatched action', () => {
      const { startIdleNavigationSpan, emit } = setUpWithNavigationEvents();

      emit({ actionType: 'NAVIGATE', payload: { name: 'profile' } });

      expect(startIdleNavigationSpan).toHaveBeenCalledWith({
        data: { action: { type: 'NAVIGATE', payload: { name: 'profile' } }, noop: false, stack: undefined },
      });
    });

    it('ignores events without an action type', () => {
      const { startIdleNavigationSpan, emit } = setUpWithNavigationEvents();

      emit({});

      expect(startIdleNavigationSpan).not.toHaveBeenCalled();
    });

    it.each(['ROUTE_NAMES_CHANGED', 'PRELOAD', 'SET_PARAMS', 'REMOVE_ROUTES', 'OPEN_DRAWER'])(
      'ignores the internal %s action',
      actionType => {
        const { startIdleNavigationSpan, emit } = setUpWithNavigationEvents();

        emit({ actionType, payload: { name: 'profile' } });

        expect(startIdleNavigationSpan).not.toHaveBeenCalled();
      },
    );

    it.each(['PUSH', 'REPLACE', 'GO_BACK', 'POP', 'POP_TO', 'POP_TO_TOP', 'JUMP_TO', 'RESET'])(
      'starts a navigation span for the %s action',
      actionType => {
        const { startIdleNavigationSpan, emit } = setUpWithNavigationEvents();

        emit({ actionType });

        expect(startIdleNavigationSpan).toHaveBeenCalledTimes(1);
      },
    );

    it('removes the listener when the client closes', () => {
      const { removeListener, closeHandlers } = setUpWithNavigationEvents();

      closeHandlers.forEach(cb => cb());

      expect(removeListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('buildExpoRouterTemplatedPath', () => {
    it('strips group segments and joins with /', () => {
      const { buildExpoRouterTemplatedPath } = require('../../src/js/tracing/expoRouterIntegration');
      expect(buildExpoRouterTemplatedPath(['(tabs)', 'profile', '[id]'])).toBe('/profile/[id]');
      expect(buildExpoRouterTemplatedPath(['posts', '[...slug]'])).toBe('/posts/[...slug]');
      expect(buildExpoRouterTemplatedPath(['(auth)', '(group)', 'login'])).toBe('/login');
    });

    it('returns / for empty or all-group segments (index routes)', () => {
      const { buildExpoRouterTemplatedPath } = require('../../src/js/tracing/expoRouterIntegration');
      expect(buildExpoRouterTemplatedPath([])).toBe('/');
      expect(buildExpoRouterTemplatedPath(undefined)).toBe('/');
      expect(buildExpoRouterTemplatedPath(['(tabs)'])).toBe('/');
    });
  });

  describe('cleanup', () => {
    it('clears the polling timer when the client closes', () => {
      const navigationRef: { current: unknown } = { current: null };
      mockExpoRouter(navigationRef);

      const { expoRouterIntegration: integration } = require('../../src/js/tracing/expoRouterIntegration');
      const { client, closeHandlers } = createMockClient();

      const baselineTimers = jest.getTimerCount();
      const integ = integration();
      integ.afterAllSetup?.(client);
      const timersAfterSetup = jest.getTimerCount();

      // Setup schedules exactly one polling timer
      expect(timersAfterSetup - baselineTimers).toBe(1);
      expect(closeHandlers.length).toBe(1);

      // Simulate client.close()
      closeHandlers.forEach(cb => cb());

      // Poll timer cleared, back to baseline
      expect(jest.getTimerCount()).toBe(baselineTimers);
    });
  });
});
