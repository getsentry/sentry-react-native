import type { Client } from '@sentry/core';

import { INTEGRATION_NAME as REACT_NAVIGATION_INTEGRATION_NAME } from '../../src/js/tracing/reactnavigation';
import { RN_GLOBAL_OBJ } from '../../src/js/utils/worldwide';

const EXPO_ROUTER_STORE_MODULE = 'expo-router/build/global-state/router-store';

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
      // No mock for expo-router/build/global-state/router-store — require will throw.
      const { expoRouterIntegration: integration } = require('../../src/js/tracing/expoRouterIntegration');
      const { client, addIntegration } = createMockClient();

      const integ = integration();
      integ.afterAllSetup?.(client);

      expect(integ.name).toBe('ExpoRouter');
      expect(addIntegration).not.toHaveBeenCalled();
    });
  });

  describe('expo-router router-store found but navigationRef missing', () => {
    it('warns and does not add the integration', () => {
      jest.doMock(EXPO_ROUTER_STORE_MODULE, () => ({ store: {} }), { virtual: true });

      const { debug } = require('@sentry/core');
      const warnSpy = jest.spyOn(debug, 'warn').mockImplementation(() => undefined);

      const { expoRouterIntegration: integration } = require('../../src/js/tracing/expoRouterIntegration');
      const { client, addIntegration } = createMockClient();

      const integ = integration();
      integ.afterAllSetup?.(client);

      expect(addIntegration).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('navigationRef'));

      warnSpy.mockRestore();
    });
  });

  describe('expo-router installed, navigationRef pre-populated', () => {
    it('registers the navigation container immediately', () => {
      const container = createMockNavigationContainer();
      jest.doMock(
        EXPO_ROUTER_STORE_MODULE,
        () => ({
          store: { navigationRef: { current: container } },
        }),
        { virtual: true },
      );

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
      jest.doMock(
        EXPO_ROUTER_STORE_MODULE,
        () => ({
          store: { navigationRef },
        }),
        { virtual: true },
      );

      const { expoRouterIntegration: integration } = require('../../src/js/tracing/expoRouterIntegration');
      const { client, addIntegration } = createMockClient();

      const integ = integration();
      integ.afterAllSetup?.(client);

      // nothing registered yet
      expect(container.addListener).not.toHaveBeenCalled();
      expect(addIntegration).toHaveBeenCalledTimes(1);

      // tick the polling timer once before ref is populated — still no registration
      jest.advanceTimersByTime(50);
      expect(container.addListener).not.toHaveBeenCalled();

      // populate the ref and tick again
      navigationRef.current = container;
      jest.advanceTimersByTime(50);

      expect(container.addListener).toHaveBeenCalledWith('__unsafe_action__', expect.any(Function));
      expect(container.addListener).toHaveBeenCalledWith('state', expect.any(Function));
    });

    it('stops polling after the timeout if ref is never populated', () => {
      const navigationRef: { current: unknown } = { current: null };
      jest.doMock(
        EXPO_ROUTER_STORE_MODULE,
        () => ({
          store: { navigationRef },
        }),
        { virtual: true },
      );

      const { expoRouterIntegration: integration } = require('../../src/js/tracing/expoRouterIntegration');
      const { client, closeHandlers } = createMockClient();

      const integ = integration();
      integ.afterAllSetup?.(client);
      const timersAfterSetup = jest.getTimerCount();

      jest.advanceTimersByTime(6_000);

      expect(jest.getTimerCount()).toBeLessThan(timersAfterSetup);
      expect(closeHandlers.length).toBe(1);
    });
  });

  describe('user already added reactNavigationIntegration', () => {
    it('reuses the existing integration and does not add a duplicate', () => {
      const container = createMockNavigationContainer();
      jest.doMock(
        EXPO_ROUTER_STORE_MODULE,
        () => ({
          store: { navigationRef: { current: container } },
        }),
        { virtual: true },
      );

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
    it('registers a route override provider on reactNavigation derived from store.getRouteInfo', () => {
      const container = createMockNavigationContainer();
      const getRouteInfo = jest.fn(() => ({
        segments: ['(tabs)', 'profile', '[id]'],
        params: { id: '123', utm_source: 'email' },
        pathnameWithParams: '/profile/123?utm_source=email',
        pathname: '/profile/123',
      }));
      jest.doMock(
        EXPO_ROUTER_STORE_MODULE,
        () => ({
          store: { navigationRef: { current: container }, getRouteInfo },
        }),
        { virtual: true },
      );

      const { expoRouterIntegration: integration } = require('../../src/js/tracing/expoRouterIntegration');
      const { client, addIntegration } = createMockClient();

      const integ = integration();
      integ.afterAllSetup?.(client);

      const reactNavigation = addIntegration.mock.calls[0][0];
      expect(typeof reactNavigation._setRouteOverrideProvider).toBe('function');

      // The integration should have installed a provider on reactNavigation. We can
      // grab it by spying on the setter.
      const setProvider = reactNavigation._setRouteOverrideProvider as jest.Mock | ((p: unknown) => void);
      // Since we don't have a spy, install one and re-run setup to capture the provider.
      jest.resetModules();
      jest.doMock(
        EXPO_ROUTER_STORE_MODULE,
        () => ({
          store: { navigationRef: { current: container }, getRouteInfo },
        }),
        { virtual: true },
      );
      const captured: { provider?: () => unknown } = {};
      const { reactNavigationIntegration: actualRn } = require('../../src/js/tracing/reactnavigation');
      const realRn = actualRn();
      jest.spyOn(realRn, '_setRouteOverrideProvider').mockImplementation((p: unknown) => {
        captured.provider = p as () => unknown;
      });
      const { client: client2, addIntegration: add2, getIntegrationByName: getByName2 } = createMockClient();
      getByName2.mockImplementation((name: string) =>
        name === REACT_NAVIGATION_INTEGRATION_NAME ? realRn : undefined,
      );
      const { expoRouterIntegration: integ2 } = require('../../src/js/tracing/expoRouterIntegration');
      integ2().afterAllSetup?.(client2);
      expect(add2).not.toHaveBeenCalled();

      const result = captured.provider?.() as {
        templatedPath: string;
        concreteUrl?: string;
        params?: Record<string, unknown>;
      };
      expect(result).toEqual({
        templatedPath: '/profile/[id]',
        concreteUrl: '/profile/123?utm_source=email',
        params: { id: '123', utm_source: 'email' },
      });
      expect(getRouteInfo).toHaveBeenCalled();
      // unused — silence ts-noemit warnings for captured `setProvider`
      void setProvider;
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
      jest.doMock(
        EXPO_ROUTER_STORE_MODULE,
        () => ({
          store: { navigationRef },
        }),
        { virtual: true },
      );

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
