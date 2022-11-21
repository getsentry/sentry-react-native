/* eslint-disable @typescript-eslint/no-empty-function */
import { TransactionContext } from '@sentry/types';
import { EmitterSubscription } from 'react-native';

import {
  ComponentWillAppearEvent,
  EventsRegistry,
  NavigationDelegate,
  ReactNativeNavigationInstrumentation,
} from '../../src/js/tracing/reactnativenavigation';
import { getBlankTransactionContext } from '../../src/js/tracing/utils';
import { getMockTransaction } from '../testutils';

interface MockEventsRegistry extends EventsRegistry {
  componentWillAppearListener?: (event: ComponentWillAppearEvent) => void;
  commandListener?: (name: string, params: unknown) => void;
  onComponentWillAppear(event: ComponentWillAppearEvent): void;
  onCommand(name: string, params: unknown): void;
}

const mockEventsRegistry: MockEventsRegistry = {
  onComponentWillAppear(event: ComponentWillAppearEvent): void {
    this.componentWillAppearListener?.(event);
  },
  onCommand(name: string, params: unknown): void {
    this.commandListener?.(name, params);
  },
  registerComponentWillAppearListener(
    callback: (event: ComponentWillAppearEvent) => void
  ) {
    this.componentWillAppearListener = callback;
    return {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      remove() {},
    } as EmitterSubscription;
  },
  registerCommandListener(callback: (name: string, params: unknown) => void) {
    this.commandListener = callback;
    return {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      remove() {},
    };
  },
};

const mockNavigationDelegate: NavigationDelegate = {
  events() {
    return mockEventsRegistry;
  },
};

describe('React Native Navigation Instrumentation', () => {
  test('Correctly instruments a route change', () => {
    const instrumentation = new ReactNativeNavigationInstrumentation(
      mockNavigationDelegate
    );

    const mockTransaction = getMockTransaction(
      ReactNativeNavigationInstrumentation.instrumentationName
    );
    const tracingListener = jest.fn(() => mockTransaction);
    instrumentation.registerRoutingInstrumentation(
      tracingListener,
      (context) => context,
      () => {}
    );

    mockEventsRegistry.onCommand('root', {});

    expect(mockTransaction.name).toBe('Route Change');

    const mockEvent: ComponentWillAppearEvent = {
      componentId: '0',
      componentName: 'Test',
      componentType: 'Component',
      passProps: {},
    };
    mockEventsRegistry.onComponentWillAppear(mockEvent);

    expect(mockTransaction.name).toBe(mockEvent.componentName);
    expect(mockTransaction.tags).toStrictEqual({
      ...getBlankTransactionContext(
        ReactNativeNavigationInstrumentation.instrumentationName
      ).tags,
      'routing.route.name': mockEvent.componentName,
    });
    expect(mockTransaction.data).toStrictEqual({
      route: {
        ...mockEvent,
        name: mockEvent.componentName,
        hasBeenSeen: false,
      },
      previousRoute: null,
    });
    expect(mockTransaction.metadata.source).toBe('component');
  });

  test('Transaction context is changed with beforeNavigate', () => {
    const instrumentation = new ReactNativeNavigationInstrumentation(
      mockNavigationDelegate
    );

    const mockTransaction = getMockTransaction(
      ReactNativeNavigationInstrumentation.instrumentationName
    );
    const tracingListener = jest.fn(() => mockTransaction);
    instrumentation.registerRoutingInstrumentation(
      tracingListener,
      (context) => {
        context.sampled = false;
        context.description = 'Description';
        context.name = 'New Name';

        return context;
      },
      () => {}
    );

    mockEventsRegistry.onCommand('root', {});

    expect(mockTransaction.name).toBe('Route Change');

    const mockEvent: ComponentWillAppearEvent = {
      componentId: '0',
      componentName: 'Test',
      componentType: 'Component',
      passProps: {},
    };
    mockEventsRegistry.onComponentWillAppear(mockEvent);

    expect(mockTransaction.name).toBe('New Name');
    expect(mockTransaction.description).toBe('Description');
    expect(mockTransaction.sampled).toBe(false);
    expect(mockTransaction.tags).toStrictEqual({
      ...getBlankTransactionContext(
        ReactNativeNavigationInstrumentation.instrumentationName
      ).tags,
      'routing.route.name': mockEvent.componentName,
    });
    expect(mockTransaction.data).toStrictEqual({
      route: {
        ...mockEvent,
        name: mockEvent.componentName,
        hasBeenSeen: false,
      },
      previousRoute: null,
    });
    expect(mockTransaction.metadata.source).toBe('custom');
  });

  test('Transaction not sent on a cancelled route change', () => {
    jest.useFakeTimers();

    const instrumentation = new ReactNativeNavigationInstrumentation(
      mockNavigationDelegate
    );

    const mockTransaction = getMockTransaction(
      ReactNativeNavigationInstrumentation.instrumentationName
    );
    const tracingListener = jest.fn(() => mockTransaction);
    instrumentation.registerRoutingInstrumentation(
      tracingListener,
      (context) => context,
      () => {}
    );

    mockEventsRegistry.onCommand('root', {});

    expect(mockTransaction.name).toBe('Route Change');
    expect(mockTransaction.sampled).toBe(true);

    jest.runAllTimers();

    expect(mockTransaction.sampled).toBe(false);

    jest.useRealTimers();
  });

  test('Transaction not sent if route change timeout is passed', () => {
    jest.useFakeTimers();

    const instrumentation = new ReactNativeNavigationInstrumentation(
      mockNavigationDelegate,
      { routeChangeTimeoutMs: 500 }
    );

    const mockTransaction = getMockTransaction(
      ReactNativeNavigationInstrumentation.instrumentationName
    );
    const tracingListener = jest.fn(() => mockTransaction);
    instrumentation.registerRoutingInstrumentation(
      tracingListener,
      (context) => context,
      () => {}
    );

    mockEventsRegistry.onCommand('root', {});

    expect(mockTransaction.name).toBe('Route Change');
    expect(mockTransaction.sampled).toBe(true);

    jest.runAllTimers();

    const mockEvent: ComponentWillAppearEvent = {
      componentId: '0',
      componentName: 'Test',
      componentType: 'Component',
      passProps: {},
    };
    mockEventsRegistry.onComponentWillAppear(mockEvent);

    expect(mockTransaction.sampled).toBe(false);
    expect(mockTransaction.name).not.toBe('Test');

    jest.useRealTimers();
  });

  describe('onRouteConfirmed', () => {
    test('onRouteConfirmed called with correct route data', () => {
      const instrumentation = new ReactNativeNavigationInstrumentation(
        mockNavigationDelegate
      );

      const mockTransaction = getMockTransaction(
        ReactNativeNavigationInstrumentation.instrumentationName
      );
      const tracingListener = jest.fn(() => mockTransaction);
      let confirmedContext: TransactionContext | undefined;
      instrumentation.registerRoutingInstrumentation(
        tracingListener,
        (context) => context,
        (context) => {
          confirmedContext = context;
        }
      );

      mockEventsRegistry.onCommand('root', {});

      expect(mockTransaction.name).toBe('Route Change');

      const mockEvent1: ComponentWillAppearEvent = {
        componentId: '1',
        componentName: 'Test 1',
        componentType: 'Component',
        passProps: {},
      };
      mockEventsRegistry.onComponentWillAppear(mockEvent1);

      mockEventsRegistry.onCommand('root', {});

      const mockEvent2: ComponentWillAppearEvent = {
        componentId: '2',
        componentName: 'Test 2',
        componentType: 'Component',
        passProps: {},
      };
      mockEventsRegistry.onComponentWillAppear(mockEvent2);

      expect(confirmedContext).toBeDefined();
      if (confirmedContext) {
        expect(confirmedContext.name).toBe(mockEvent2.componentName);
        expect(confirmedContext.metadata).toBeUndefined();
        expect(confirmedContext.data).toBeDefined();
        if (confirmedContext.data) {
          expect(confirmedContext.data.route.name).toBe(
            mockEvent2.componentName
          );
          expect(confirmedContext.data.previousRoute).toBeDefined();
          if (confirmedContext.data.previousRoute) {
            expect(confirmedContext.data.previousRoute.name).toBe(
              mockEvent1.componentName
            );
          }
        }
      }
    });

    test('onRouteConfirmed clears transaction', () => {
      const instrumentation = new ReactNativeNavigationInstrumentation(
        mockNavigationDelegate
      );

      const mockTransaction = getMockTransaction(
        ReactNativeNavigationInstrumentation.instrumentationName
      );
      const tracingListener = jest.fn(() => mockTransaction);
      let confirmedContext: TransactionContext | undefined;
      instrumentation.registerRoutingInstrumentation(
        tracingListener,
        (context) => context,
        (context) => {
          confirmedContext = context;
        }
      );

      mockEventsRegistry.onCommand('root', {});

      expect(mockTransaction.name).toBe('Route Change');

      const mockEvent1: ComponentWillAppearEvent = {
        componentId: '1',
        componentName: 'Test 1',
        componentType: 'Component',
        passProps: {},
      };
      mockEventsRegistry.onComponentWillAppear(mockEvent1);

      const mockEvent2: ComponentWillAppearEvent = {
        componentId: '2',
        componentName: 'Test 2',
        componentType: 'Component',
        passProps: {},
      };
      mockEventsRegistry.onComponentWillAppear(mockEvent2);

      expect(confirmedContext).toBeDefined();
      if (confirmedContext) {
        expect(confirmedContext.name).toBe(mockEvent1.componentName);
      }
    });
  });
});
