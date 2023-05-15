/* eslint-disable @typescript-eslint/no-empty-function */
import type { Transaction, TransactionContext } from '@sentry/types';
import type { EmitterSubscription } from 'react-native';

import type {
  BottomTabPressedEvent,
  ComponentWillAppearEvent,
  EventsRegistry,
  NavigationDelegate,
} from '../../src/js/tracing/reactnativenavigation';
import { ReactNativeNavigationInstrumentation } from '../../src/js/tracing/reactnativenavigation';
import type { TransactionCreator } from '../../src/js/tracing/routingInstrumentation';
import { getMockTransaction } from '../testutils';

interface MockEventsRegistry extends EventsRegistry {
  componentWillAppearListener?: (event: ComponentWillAppearEvent) => void;
  commandListener?: (name: string, params: unknown) => void;
  bottomTabPressedListener?: (event: BottomTabPressedEvent) => void;
  onComponentWillAppear(event: ComponentWillAppearEvent): void;
  onCommand(name: string, params: unknown): void;
  onBottomTabPressed(event: BottomTabPressedEvent): void;
}

const mockEventsRegistry: MockEventsRegistry = {
  onComponentWillAppear(event: ComponentWillAppearEvent): void {
    this.componentWillAppearListener?.(event);
  },
  onCommand(name: string, params: unknown): void {
    this.commandListener?.(name, params);
  },
  onBottomTabPressed(event) {
    this.bottomTabPressedListener?.(event);
  },
  registerComponentWillAppearListener(callback: (event: ComponentWillAppearEvent) => void) {
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
  registerBottomTabPressedListener(callback: (event: BottomTabPressedEvent) => void) {
    this.bottomTabPressedListener = callback;
    return {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      remove() {},
    } as EmitterSubscription;
  },
};

const mockNavigationDelegate: NavigationDelegate = {
  events() {
    return mockEventsRegistry;
  },
};

describe('React Native Navigation Instrumentation', () => {
  let instrumentation: ReactNativeNavigationInstrumentation;
  let tracingListener: jest.Mock<ReturnType<TransactionCreator>, Parameters<TransactionCreator>>;
  let mockTransaction: Transaction;

  beforeEach(() => {
    instrumentation = new ReactNativeNavigationInstrumentation(mockNavigationDelegate);

    mockTransaction = getMockTransaction(ReactNativeNavigationInstrumentation.instrumentationName);

    tracingListener = jest.fn((_context: TransactionContext) => mockTransaction);
    instrumentation.registerRoutingInstrumentation(
      tracingListener,
      context => context,
      () => {},
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('Correctly instruments a route change', () => {
    mockEventsRegistry.onCommand('root', {});

    expect(mockTransaction.name).toBe('Route Change');

    const mockEvent: ComponentWillAppearEvent = {
      componentId: '0',
      componentName: 'Test',
      componentType: 'Component',
      passProps: {},
    };
    mockEventsRegistry.onComponentWillAppear(mockEvent);

    expect(mockTransaction).toEqual(
      expect.objectContaining(<Partial<Transaction>>{
        name: 'Test',
        tags: {
          'routing.instrumentation': 'react-native-navigation',
          'routing.route.name': 'Test',
        },
        data: {
          route: {
            componentId: '0',
            componentName: 'Test',
            componentType: 'Component',
            passProps: {},
            name: 'Test',
            hasBeenSeen: false,
          },
          previousRoute: null,
        },
        metadata: expect.objectContaining({
          source: 'component',
        }),
      }),
    );
  });

  test('Transaction context is changed with beforeNavigate', () => {
    instrumentation.registerRoutingInstrumentation(
      tracingListener,
      context => {
        context.sampled = false;
        context.description = 'Description';
        context.name = 'New Name';

        return context;
      },
      () => {},
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

    expect(mockTransaction).toEqual(
      expect.objectContaining(<Partial<Transaction>>{
        name: 'New Name',
        description: 'Description',
        sampled: false,
        tags: {
          'routing.instrumentation': 'react-native-navigation',
          'routing.route.name': 'Test',
        },
        data: {
          route: {
            componentId: '0',
            componentName: 'Test',
            componentType: 'Component',
            passProps: {},
            name: 'Test',
            hasBeenSeen: false,
          },
          previousRoute: null,
        },
        metadata: expect.objectContaining({
          source: 'custom',
        }),
      }),
    );
  });

  test('Transaction not sent on a cancelled route change', () => {
    jest.useFakeTimers();

    mockEventsRegistry.onCommand('root', {});

    expect(mockTransaction.name).toBe('Route Change');
    expect(mockTransaction.sampled).toBe(true);

    jest.runAllTimers();

    expect(mockTransaction.sampled).toBe(false);

    jest.useRealTimers();
  });

  test('Transaction not sent if route change timeout is passed', () => {
    jest.useFakeTimers();

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

  describe('tab change', () => {
    beforeEach(() => {
      instrumentation = new ReactNativeNavigationInstrumentation(mockNavigationDelegate, {
        enableTabsInstrumentation: true,
      });
      instrumentation.registerRoutingInstrumentation(
        tracingListener,
        context => context,
        () => {},
      );
    });

    test('correctly instruments a tab change', () => {
      mockEventsRegistry.onBottomTabPressed({ tabIndex: 0 });
      mockEventsRegistry.onComponentWillAppear(<ComponentWillAppearEvent>{
        componentId: '0',
        componentName: 'TestScreenName',
        componentType: 'Component',
        passProps: {},
      });

      expect(mockTransaction.toContext()).toEqual(
        expect.objectContaining(<Partial<TransactionContext>>{
          name: 'TestScreenName',
          tags: {
            'routing.instrumentation': 'react-native-navigation',
            'routing.route.name': 'TestScreenName',
          },
          data: {
            route: {
              componentId: '0',
              componentName: 'TestScreenName',
              componentType: 'Component',
              passProps: {},
              name: 'TestScreenName',
              hasBeenSeen: false,
            },
            previousRoute: null,
          },
        }),
      );
    });

    test('not instrument tabs if disabled', () => {
      jest.useFakeTimers();

      instrumentation = new ReactNativeNavigationInstrumentation(mockNavigationDelegate, {
        enableTabsInstrumentation: false,
      });
      tracingListener = jest.fn((_context: TransactionContext) => mockTransaction);
      instrumentation.registerRoutingInstrumentation(
        tracingListener,
        context => context,
        () => {},
      );

      mockEventsRegistry.onBottomTabPressed({ tabIndex: 0 });
      mockEventsRegistry.onComponentWillAppear(<ComponentWillAppearEvent>{
        componentId: '0',
        componentName: 'TestScreenName',
        componentType: 'Component',
      });

      expect(tracingListener).not.toBeCalled();

      jest.runAllTimers();
      expect(mockTransaction.sampled).toBe(false);

      jest.useRealTimers();
    });
  });

  describe('onRouteConfirmed', () => {
    let confirmedContext: TransactionContext | undefined;

    beforeEach(() => {
      instrumentation.registerRoutingInstrumentation(
        tracingListener,
        context => context,
        context => {
          confirmedContext = context;
        },
      );
    });

    test('onRouteConfirmed called with correct route data', () => {
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

      expect(confirmedContext).toEqual(
        expect.objectContaining(<Partial<TransactionContext>>{
          name: 'Test 2',
          data: {
            route: expect.objectContaining({
              name: 'Test 2',
            }),
            previousRoute: expect.objectContaining({
              name: 'Test 1',
            }),
          },
        }),
      );
    });

    test('onRouteConfirmed clears transaction', () => {
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

      expect(confirmedContext).toEqual(
        expect.objectContaining(<Partial<TransactionContext>>{
          name: 'Test 1',
        }),
      );
    });
  });
});
