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
    emitNavigationWithUndefinedRoute: () => {
      mockedNavigationContained.listeners['__unsafe_action__'](navigationAction);
      mockedNavigationContained.currentRoute = undefined as any;
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
  getState(): any {
    return undefined;
  }
}

export class MockNavigationContainerWithState extends MockNavigationContainer {
  currentState: any = undefined;

  getState(): any {
    return this.currentState;
  }
}

export function createMockNavigationWithNestedState(sut: ReturnType<typeof reactNavigationIntegration>) {
  const mockedNavigationContainer = new MockNavigationContainerWithState();

  const mockedNavigation = {
    navigateToNestedScreen: () => {
      // Simulate nested navigation: Home -> Settings -> Profile
      mockedNavigationContainer.currentRoute = {
        key: 'profile_screen',
        name: 'Profile',
      };
      mockedNavigationContainer.currentState = {
        index: 0,
        routes: [
          {
            name: 'Home',
            key: 'home',
            state: {
              index: 0,
              routes: [
                {
                  name: 'Settings',
                  key: 'settings',
                  state: {
                    index: 0,
                    routes: [
                      {
                        name: 'Profile',
                        key: 'profile_screen',
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      };
      mockedNavigationContainer.listeners['__unsafe_action__'](navigationAction);
      mockedNavigationContainer.listeners['state']({});
    },
    navigateToTwoLevelNested: () => {
      // Simulate two-level nested navigation: Tabs -> Settings
      mockedNavigationContainer.currentRoute = {
        key: 'settings_screen',
        name: 'Settings',
      };
      mockedNavigationContainer.currentState = {
        index: 0,
        routes: [
          {
            name: 'Tabs',
            key: 'tabs',
            state: {
              index: 1,
              routes: [
                {
                  name: 'Home',
                  key: 'home',
                },
                {
                  name: 'Settings',
                  key: 'settings_screen',
                },
              ],
            },
          },
        ],
      };
      mockedNavigationContainer.listeners['__unsafe_action__'](navigationAction);
      mockedNavigationContainer.listeners['state']({});
    },
  };

  sut.registerNavigationContainer(mockRef(mockedNavigationContainer));
  return mockedNavigation;
}
