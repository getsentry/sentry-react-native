import { render } from '@testing-library/react-native';
import * as React from 'react';
import { Text } from 'react-native';

import { NavigationContainer } from '../src/js/NavigationContainer';

const mockDebugWarn = jest.fn();

jest.mock('@sentry/core', () => ({
  getClient: () => undefined,
  debug: {
    get log() {
      return jest.fn();
    },
    get warn() {
      return mockDebugWarn;
    },
  },
}));

jest.mock('../src/js/tracing/reactnavigation', () => ({
  getReactNavigationIntegration: () => undefined,
}));

jest.mock('../src/js/reactNavigationImport', () => ({
  getNavigationContainerComponent: () => null,
}));

describe('NavigationContainer without @react-navigation/native', () => {
  it('renders children directly and warns', () => {
    const { getByText } = render(
      <NavigationContainer>
        <Text>Fallback Content</Text>
      </NavigationContainer>,
    );
    expect(getByText('Fallback Content')).toBeTruthy();
    expect(mockDebugWarn).toHaveBeenCalled();
  });

  it('calls onReady in the fallback path', () => {
    const userOnReady = jest.fn();
    render(
      <NavigationContainer onReady={userOnReady}>
        <Text>Fallback Content</Text>
      </NavigationContainer>,
    );
    expect(userOnReady).toHaveBeenCalledTimes(1);
  });
});
