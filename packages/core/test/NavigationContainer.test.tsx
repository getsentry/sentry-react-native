import * as React from 'react';
import { Text, View } from 'react-native';
import { render } from '@testing-library/react-native';

import { NavigationContainer } from '../src/js/NavigationContainer';

const mockRegisterNavigationContainer = jest.fn();
const mockGetClient = jest.fn();
const mockDebugLog = jest.fn();
const mockDebugWarn = jest.fn();

jest.mock('@sentry/core', () => ({
  getClient: (...args: unknown[]) => mockGetClient(...args),
  debug: { get log() { return mockDebugLog; }, get warn() { return mockDebugWarn; } },
}));

jest.mock('../src/js/tracing/reactnavigation', () => ({
  getReactNavigationIntegration: (client: unknown) => {
    if (client) {
      return { registerNavigationContainer: mockRegisterNavigationContainer };
    }
    return undefined;
  },
}));

const MockNavigationContainerComponent = React.forwardRef<View, Record<string, unknown>>((props, ref) => {
  const { onReady, children, ...rest } = props;
  React.useEffect(() => {
    if (typeof onReady === 'function') {
      (onReady as () => void)();
    }
  }, [onReady]);
  return (
    <View ref={ref as React.Ref<View>} testID="mock-navigation-container" {...rest}>
      {children as React.ReactNode}
    </View>
  );
});

jest.mock('../src/js/reactNavigationImport', () => ({
  getNavigationContainerComponent: () => MockNavigationContainerComponent,
}));

describe('NavigationContainer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetClient.mockReturnValue({ getIntegrationByName: jest.fn() });
  });

  it('renders children through to the underlying NavigationContainer', () => {
    const { getByText } = render(
      <NavigationContainer>
        <Text>Child Content</Text>
      </NavigationContainer>,
    );
    expect(getByText('Child Content')).toBeTruthy();
  });

  it('calls registerNavigationContainer on ready', () => {
    render(
      <NavigationContainer>
        <Text>App</Text>
      </NavigationContainer>,
    );
    expect(mockRegisterNavigationContainer).toHaveBeenCalledTimes(1);
    expect(mockRegisterNavigationContainer).toHaveBeenCalledWith(expect.objectContaining({ current: expect.anything() }));
  });

  it('forwards ref to the underlying NavigationContainer', () => {
    const ref = React.createRef<unknown>();
    render(
      <NavigationContainer ref={ref}>
        <Text>App</Text>
      </NavigationContainer>,
    );
    expect(ref.current).toBeTruthy();
  });

  it('calls registerNavigationContainer before user onReady', () => {
    const callOrder: string[] = [];
    mockRegisterNavigationContainer.mockImplementation(() => callOrder.push('sentry'));
    const userOnReady = jest.fn(() => callOrder.push('user'));
    render(
      <NavigationContainer onReady={userOnReady}>
        <Text>App</Text>
      </NavigationContainer>,
    );
    expect(callOrder).toEqual(['sentry', 'user']);
  });

  it('chains user-provided onReady callback', () => {
    const userOnReady = jest.fn();
    render(
      <NavigationContainer onReady={userOnReady}>
        <Text>App</Text>
      </NavigationContainer>,
    );
    expect(userOnReady).toHaveBeenCalledTimes(1);
    expect(mockRegisterNavigationContainer).toHaveBeenCalledTimes(1);
  });

  it('no-ops when client is not available', () => {
    mockGetClient.mockReturnValue(undefined);
    render(
      <NavigationContainer>
        <Text>App</Text>
      </NavigationContainer>,
    );
    expect(mockRegisterNavigationContainer).not.toHaveBeenCalled();
  });

  it('passes through all props to NavigationContainer', () => {
    const { getByTestId } = render(
      <NavigationContainer accessibilityLabel="nav">
        <Text>App</Text>
      </NavigationContainer>,
    );
    const container = getByTestId('mock-navigation-container');
    expect(container.props.accessibilityLabel).toBe('nav');
  });
});
