import type { NavigationRoute, reactNavigationIntegration } from '../../src/js/tracing/reactnavigation';
import type { UnsafeAction } from '../../src/js/vendor/react-navigation/types';

const navigationAction: UnsafeAction = {
  data: {
    action: {
      type: 'NAVIGATE',
    },
    noop: false,
    stack: undefined,
  },
};

export function createMockNavigationAndAttachTo(sut: ReturnType<typeof reactNavigationIntegration>) {
  const mockedNavigationContained = mockNavigationContainer();
  const mockedNavigation = {
    emitCancelledNavigation: () => {
      mockedNavigationContained.listeners['__unsafe_action__'](navigationAction);
    },
    navigateToNewScreen: () => {
      mockedNavigationContained.listeners['__unsafe_action__'](navigationAction);
      mockedNavigationContained.currentRoute = {
        key: 'new_screen',
        name: 'New Screen',
      };
      mockedNavigationContained.listeners['state']({
        // this object is not used by the instrumentation
      });
    },
    navigateToSecondScreen: () => {
      mockedNavigationContained.listeners['__unsafe_action__'](navigationAction);
      mockedNavigationContained.currentRoute = {
        key: 'second_screen',
        name: 'Second Screen',
      };
      mockedNavigationContained.listeners['state']({
        // this object is not used by the instrumentation
      });
    },
    navigateToInitialScreen: () => {
      mockedNavigationContained.listeners['__unsafe_action__'](navigationAction);
      mockedNavigationContained.currentRoute = {
        key: 'initial_screen',
        name: 'Initial Screen',
      };
      mockedNavigationContained.listeners['state']({
        // this object is not used by the instrumentation
      });
    },
    finishAppStartNavigation: () => {
      mockedNavigationContained.currentRoute = {
        key: 'initial_screen',
        name: 'Initial Screen',
      };
      mockedNavigationContained.listeners['state']({
        // this object is not used by the instrumentation
      });
    },
    emitNavigationWithoutStateChange: () => {
      mockedNavigationContained.listeners['__unsafe_action__'](navigationAction);
    },
    emitWithoutStateChange: (action: UnsafeAction) => {
      mockedNavigationContained.listeners['__unsafe_action__'](action);
    },
    emitWithStateChange: (action: UnsafeAction) => {
      mockedNavigationContained.listeners['__unsafe_action__'](action);
      mockedNavigationContained.listeners['state']({
        // this object is not used by the instrumentation
      });
    },
  };
  sut.registerNavigationContainer(mockRef(mockedNavigationContained));

  return mockedNavigation;
}

function mockRef<T>(wat: T): { current: T } {
  return {
    current: wat,
  };
}

function mockNavigationContainer(): MockNavigationContainer {
  return new MockNavigationContainer();
}

export class MockNavigationContainer {
  currentRoute: NavigationRoute = {
    key: 'initial_screen',
    name: 'Initial Screen',
  };
  listeners: Record<string, (e: any) => void> = {};
  addListener: any = jest.fn((eventType: string, listener: (e: any) => void): void => {
    this.listeners[eventType] = listener;
  });
  getCurrentRoute(): NavigationRoute | undefined {
    return this.currentRoute;
  }
}
