import { SPAN_STATUS_ERROR } from '@sentry/core';
import { render } from '@testing-library/react-native';
import * as React from 'react';
import { Text } from 'react-native';

import {
  EXPO_ROUTER_ERROR_BOUNDARY_INTEGRATION_NAME,
  wrapExpoRouterErrorBoundary,
} from '../../src/js/tracing/expoRouterErrorBoundary';

const mockCaptureException = jest.fn();
const mockAddBreadcrumb = jest.fn();
const mockAddExceptionMechanism = jest.fn();
const mockAddIntegration = jest.fn();
const mockGetIntegrationByName = jest.fn().mockReturnValue(undefined);
let mockSendDefaultPii = false;
let mockActiveSpan: { setStatus: jest.Mock; __origin?: string } | undefined;

jest.mock('@sentry/core', () => {
  const actual = jest.requireActual('@sentry/core');
  return {
    ...actual,
    captureException: (...args: unknown[]) => mockCaptureException(...args),
    addBreadcrumb: (...args: unknown[]) => mockAddBreadcrumb(...args),
    addExceptionMechanism: (...args: unknown[]) => mockAddExceptionMechanism(...args),
    getClient: () => ({
      getOptions: () => ({ sendDefaultPii: mockSendDefaultPii }),
      getIntegrationByName: mockGetIntegrationByName,
      addIntegration: mockAddIntegration,
    }),
    getActiveSpan: () => mockActiveSpan,
    getRootSpan: (span: unknown) => span,
    spanToJSON: (span: { __origin?: string } | undefined) => ({ origin: span?.__origin }),
  };
});

const mockRouteInfo = {
  templatedPath: '/users/[id]',
  pathname: '/users/42',
  pathnameWithParams: '/users/42?ref=email',
  params: { id: '42', ref: 'email' },
  segments: ['(tabs)', 'users', '[id]'],
};
let mockRouteInfoValue: typeof mockRouteInfo | undefined = mockRouteInfo;

jest.mock('../../src/js/tracing/expoRouterStore', () => ({
  getCurrentExpoRouterRouteInfo: () => mockRouteInfoValue,
}));

const OriginalErrorBoundary: React.FC<{ error: Error; retry: () => Promise<void> }> = ({ error }) => (
  <Text testID="fallback">{error.message}</Text>
);

function runScope(): {
  tags: Record<string, string>;
  contexts: Record<string, unknown>;
  processors: ((e: unknown) => unknown)[];
} {
  const tags: Record<string, string> = {};
  const contexts: Record<string, unknown> = {};
  const processors: ((e: unknown) => unknown)[] = [];
  const scope = {
    setTag: (k: string, v: string) => {
      tags[k] = v;
    },
    setContext: (k: string, v: unknown) => {
      contexts[k] = v;
    },
    addEventProcessor: (p: (e: unknown) => unknown) => {
      processors.push(p);
    },
  };
  const callback = mockCaptureException.mock.calls[0]?.[1];
  callback?.(scope);
  return { tags, contexts, processors };
}

describe('wrapExpoRouterErrorBoundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendDefaultPii = false;
    mockActiveSpan = undefined;
    mockRouteInfoValue = mockRouteInfo;
  });

  it('renders the wrapped ErrorBoundary with the original props', () => {
    const Wrapped = wrapExpoRouterErrorBoundary(OriginalErrorBoundary);
    const { getByTestId } = render(<Wrapped error={new Error('boom')} retry={jest.fn()} />);
    expect(getByTestId('fallback').props.children).toBe('boom');
  });

  it('registers the ExpoRouterErrorBoundary marker at wrap-call time (before any mount)', () => {
    wrapExpoRouterErrorBoundary(OriginalErrorBoundary);
    expect(mockAddIntegration).toHaveBeenCalledWith({ name: EXPO_ROUTER_ERROR_BOUNDARY_INTEGRATION_NAME });
  });

  it('captures the error to Sentry once per error instance', () => {
    const Wrapped = wrapExpoRouterErrorBoundary(OriginalErrorBoundary);
    const err = new Error('boom');
    const { rerender } = render(<Wrapped error={err} retry={jest.fn()} />);
    rerender(<Wrapped error={err} retry={jest.fn()} />);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException.mock.calls[0][0]).toBe(err);
  });

  it('re-captures when a new error instance arrives', () => {
    const Wrapped = wrapExpoRouterErrorBoundary(OriginalErrorBoundary);
    const { rerender } = render(<Wrapped error={new Error('a')} retry={jest.fn()} />);
    rerender(<Wrapped error={new Error('b')} retry={jest.fn()} />);
    expect(mockCaptureException).toHaveBeenCalledTimes(2);
  });

  it('attaches route context with templated path only when sendDefaultPii is off', () => {
    const Wrapped = wrapExpoRouterErrorBoundary(OriginalErrorBoundary);
    render(<Wrapped error={new Error('boom')} retry={jest.fn()} />);

    const { tags, contexts } = runScope();
    expect(tags['expo_router.error_boundary']).toBe('true');
    expect(contexts.route).toEqual({
      name: '/users/[id]',
      segments: ['(tabs)', 'users', '[id]'],
    });
  });

  it('includes concrete path and params when sendDefaultPii is on', () => {
    mockSendDefaultPii = true;
    const Wrapped = wrapExpoRouterErrorBoundary(OriginalErrorBoundary);
    render(<Wrapped error={new Error('boom')} retry={jest.fn()} />);

    const { contexts } = runScope();
    expect(contexts.route).toEqual({
      name: '/users/[id]',
      path: '/users/42?ref=email',
      params: { id: '42', ref: 'email' },
      segments: ['(tabs)', 'users', '[id]'],
    });
  });

  it('adds a breadcrumb with the templated route name', () => {
    const Wrapped = wrapExpoRouterErrorBoundary(OriginalErrorBoundary);
    render(<Wrapped error={new Error('boom')} retry={jest.fn()} />);

    expect(mockAddBreadcrumb).toHaveBeenCalledWith({
      category: 'expo-router.error_boundary',
      type: 'error',
      level: 'error',
      message: 'Expo Router ErrorBoundary rendered for /users/[id]',
      data: { 'route.name': '/users/[id]' },
    });
  });

  it('tags the exception with an expo_router_error_boundary mechanism', () => {
    const Wrapped = wrapExpoRouterErrorBoundary(OriginalErrorBoundary);
    render(<Wrapped error={new Error('boom')} retry={jest.fn()} />);

    const { processors } = runScope();
    const event = { exception: { values: [{}] } };
    processors[0]?.(event);
    expect(mockAddExceptionMechanism).toHaveBeenCalledWith(event, {
      type: 'expo_router_error_boundary',
      handled: true,
    });
  });

  it('marks the active navigation span as errored', () => {
    mockActiveSpan = {
      setStatus: jest.fn(),
      __origin: 'auto.navigation.expo_router',
    };
    const Wrapped = wrapExpoRouterErrorBoundary(OriginalErrorBoundary);
    render(<Wrapped error={new Error('boom')} retry={jest.fn()} />);

    expect(mockActiveSpan.setStatus).toHaveBeenCalledWith({
      code: SPAN_STATUS_ERROR,
      message: 'expo_router_error_boundary',
    });
  });

  it('does not touch user-owned spans (non-navigation origin)', () => {
    mockActiveSpan = {
      setStatus: jest.fn(),
      __origin: 'manual',
    };
    const Wrapped = wrapExpoRouterErrorBoundary(OriginalErrorBoundary);
    render(<Wrapped error={new Error('boom')} retry={jest.fn()} />);

    expect(mockActiveSpan.setStatus).not.toHaveBeenCalled();
  });

  it('does not re-report the same error across an unmount/remount cycle', () => {
    const Wrapped = wrapExpoRouterErrorBoundary(OriginalErrorBoundary);
    const err = new Error('boom');
    const first = render(<Wrapped error={err} retry={jest.fn()} />);
    first.unmount();
    render(<Wrapped error={err} retry={jest.fn()} />);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('still renders the fallback when Sentry instrumentation throws', () => {
    mockCaptureException.mockImplementationOnce(() => {
      throw new Error('sentry boom');
    });
    const Wrapped = wrapExpoRouterErrorBoundary(OriginalErrorBoundary);
    const { getByTestId } = render(<Wrapped error={new Error('boom')} retry={jest.fn()} />);
    expect(getByTestId('fallback').props.children).toBe('boom');
  });

  it('retries capture on the next render after a transient reporting failure', () => {
    mockCaptureException.mockImplementationOnce(() => {
      throw new Error('sentry boom');
    });
    const Wrapped = wrapExpoRouterErrorBoundary(OriginalErrorBoundary);
    const err = new Error('boom');
    const first = render(<Wrapped error={err} retry={jest.fn()} />);
    first.unmount();
    render(<Wrapped error={err} retry={jest.fn()} />);
    expect(mockCaptureException).toHaveBeenCalledTimes(2);
  });

  it('still works when expo-router store is not reachable', () => {
    mockRouteInfoValue = undefined;
    const Wrapped = wrapExpoRouterErrorBoundary(OriginalErrorBoundary);
    render(<Wrapped error={new Error('boom')} retry={jest.fn()} />);

    const { tags, contexts } = runScope();
    expect(tags['expo_router.error_boundary']).toBe('true');
    expect(contexts.route).toEqual({ name: 'unknown' });
    expect(mockAddBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Expo Router ErrorBoundary rendered for unknown' }),
    );
  });
});
