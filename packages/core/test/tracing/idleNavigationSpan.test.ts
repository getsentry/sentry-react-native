import { getActiveSpan, spanToJSON } from '@sentry/core';
import type { AppState, AppStateStatus } from 'react-native';

import { startIdleNavigationSpan } from '../../src/js/tracing/span';
import { NATIVE } from '../../src/js/wrapper';
import { setupTestClient } from '../mocks/client';

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

describe('startIdleNavigationSpan', () => {
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
    setupTestClient();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('Cancels route transaction when app goes to background', async () => {
    const routeTransaction = startIdleNavigationSpan({
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

    startIdleNavigationSpan({
      name: 'test',
    });

    await jest.advanceTimersByTimeAsync(500);
    const transaction = getActiveSpan();

    jest.runAllTimers();

    expect(spanToJSON(transaction!).timestamp).toBeDefined();
  });
});
