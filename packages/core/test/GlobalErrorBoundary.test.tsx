import * as SentryCore from '@sentry/core';
import * as SentryReact from '@sentry/react';
import { act, fireEvent, render } from '@testing-library/react-native';
import * as React from 'react';
import { Text, View } from 'react-native';

import { GlobalErrorBoundary, withGlobalErrorBoundary } from '../src/js/GlobalErrorBoundary';
import {
  _resetGlobalErrorBus,
  hasInterestedSubscribers,
  publishGlobalError,
} from '../src/js/integrations/globalErrorBus';

function Fallback({ error, resetError }: { error: unknown; resetError: () => void }): React.ReactElement {
  return (
    <View>
      <Text testID="fallback">fallback:{(error as Error)?.message ?? 'none'}</Text>
      <Text testID="reset" onPress={resetError}>
        reset
      </Text>
    </View>
  );
}

function Ok(): React.ReactElement {
  return <Text testID="ok">ok</Text>;
}

describe('GlobalErrorBoundary', () => {
  // react-test-renderer / React surfaces a console.error for uncaught exceptions
  // routed through componentDidCatch. Silence to keep test output clean.
  let errorSpy: jest.SpyInstance;
  beforeAll(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterAll(() => {
    errorSpy.mockRestore();
  });

  beforeEach(() => {
    _resetGlobalErrorBus();
  });

  test('renders children when no error occurs', () => {
    const { queryByTestId } = render(
      <GlobalErrorBoundary fallback={props => <Fallback {...props} />}>
        <Ok />
      </GlobalErrorBoundary>,
    );

    expect(queryByTestId('ok')).not.toBeNull();
    expect(queryByTestId('fallback')).toBeNull();
  });

  test('renders fallback on a render-phase error (delegates to upstream ErrorBoundary)', () => {
    function Boom(): React.ReactElement {
      throw new Error('render-boom');
    }

    const { getByTestId } = render(
      <GlobalErrorBoundary fallback={props => <Fallback {...props} />}>
        <Boom />
      </GlobalErrorBoundary>,
    );

    expect(getByTestId('fallback').props.children.join('')).toBe('fallback:render-boom');
  });

  test('renders fallback when a fatal global error is published', () => {
    const { getByTestId, queryByTestId } = render(
      <GlobalErrorBoundary fallback={props => <Fallback {...props} />}>
        <Ok />
      </GlobalErrorBoundary>,
    );

    act(() => {
      publishGlobalError({ error: new Error('global-boom'), isFatal: true, kind: 'onerror' });
    });

    expect(getByTestId('fallback').props.children.join('')).toBe('fallback:global-boom');
    expect(queryByTestId('ok')).toBeNull();
  });

  test('ignores non-fatal global errors by default', () => {
    const { queryByTestId } = render(
      <GlobalErrorBoundary fallback={props => <Fallback {...props} />}>
        <Ok />
      </GlobalErrorBoundary>,
    );

    act(() => {
      publishGlobalError({ error: new Error('soft'), isFatal: false, kind: 'onerror' });
    });

    expect(queryByTestId('ok')).not.toBeNull();
    expect(queryByTestId('fallback')).toBeNull();
  });

  test('renders fallback for non-fatal global errors when opted in', () => {
    const { getByTestId } = render(
      <GlobalErrorBoundary fallback={props => <Fallback {...props} />} includeNonFatalGlobalErrors>
        <Ok />
      </GlobalErrorBoundary>,
    );

    act(() => {
      publishGlobalError({ error: new Error('soft'), isFatal: false, kind: 'onerror' });
    });

    expect(getByTestId('fallback').props.children.join('')).toBe('fallback:soft');
  });

  test('ignores unhandled promise rejections by default', () => {
    const { queryByTestId } = render(
      <GlobalErrorBoundary fallback={props => <Fallback {...props} />}>
        <Ok />
      </GlobalErrorBoundary>,
    );

    act(() => {
      publishGlobalError({ error: new Error('rej'), isFatal: false, kind: 'onunhandledrejection' });
    });

    expect(queryByTestId('fallback')).toBeNull();
  });

  test('renders fallback for unhandled rejections when opted in', () => {
    const { getByTestId } = render(
      <GlobalErrorBoundary fallback={props => <Fallback {...props} />} includeUnhandledRejections>
        <Ok />
      </GlobalErrorBoundary>,
    );

    act(() => {
      publishGlobalError({ error: new Error('rej'), isFatal: false, kind: 'onunhandledrejection' });
    });

    expect(getByTestId('fallback').props.children.join('')).toBe('fallback:rej');
  });

  test('resetError restores children and clears internal state', () => {
    const onReset = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <GlobalErrorBoundary fallback={props => <Fallback {...props} />} onReset={onReset}>
        <Ok />
      </GlobalErrorBoundary>,
    );

    act(() => {
      publishGlobalError({ error: new Error('first'), isFatal: true, kind: 'onerror' });
    });
    expect(queryByTestId('fallback')).not.toBeNull();

    fireEvent.press(getByTestId('reset'));

    expect(queryByTestId('ok')).not.toBeNull();
    expect(queryByTestId('fallback')).toBeNull();
    expect(onReset).toHaveBeenCalledTimes(1);

    act(() => {
      publishGlobalError({ error: new Error('second'), isFatal: true, kind: 'onerror' });
    });
    expect(getByTestId('fallback').props.children.join('')).toBe('fallback:second');
  });

  test('first global error wins while fallback is mounted', () => {
    const { getByTestId } = render(
      <GlobalErrorBoundary fallback={props => <Fallback {...props} />}>
        <Ok />
      </GlobalErrorBoundary>,
    );

    act(() => {
      publishGlobalError({ error: new Error('first'), isFatal: true, kind: 'onerror' });
      publishGlobalError({ error: new Error('second'), isFatal: true, kind: 'onerror' });
    });

    expect(getByTestId('fallback').props.children.join('')).toBe('fallback:first');
  });

  test('unsubscribes on unmount', () => {
    const { unmount } = render(
      <GlobalErrorBoundary fallback={props => <Fallback {...props} />}>
        <Ok />
      </GlobalErrorBoundary>,
    );

    expect(hasInterestedSubscribers('onerror', true)).toBe(true);
    unmount();
    expect(hasInterestedSubscribers('onerror', true)).toBe(false);
  });

  test('does not double-capture global errors through the inner ErrorBoundary', () => {
    // The integration captures the fatal before publishing to the bus; if we
    // also re-threw through the inner ErrorBoundary, componentDidCatch would
    // call captureReactException and produce a duplicate Sentry event.
    const captureReactExceptionSpy = jest.spyOn(SentryReact, 'captureReactException');
    jest.spyOn(SentryCore, 'lastEventId').mockReturnValue('evt-global');

    const { getByTestId } = render(
      <GlobalErrorBoundary fallback={props => <Fallback {...props} />}>
        <Ok />
      </GlobalErrorBoundary>,
    );

    act(() => {
      publishGlobalError({ error: new Error('global-once'), isFatal: true, kind: 'onerror' });
    });

    expect(getByTestId('fallback').props.children.join('')).toBe('fallback:global-once');
    expect(captureReactExceptionSpy).not.toHaveBeenCalled();
    captureReactExceptionSpy.mockRestore();
  });

  test('surfaces lastEventId to the fallback for global errors', () => {
    jest.spyOn(SentryCore, 'lastEventId').mockReturnValue('evt-abc123');

    let capturedEventId = '';
    const { getByTestId } = render(
      <GlobalErrorBoundary
        fallback={({ error, eventId, resetError }) => {
          capturedEventId = eventId;
          return <Fallback error={error} resetError={resetError} />;
        }}
      >
        <Ok />
      </GlobalErrorBoundary>,
    );

    act(() => {
      publishGlobalError({ error: new Error('with-event'), isFatal: true, kind: 'onerror' });
    });

    expect(getByTestId('fallback')).not.toBeNull();
    expect(capturedEventId).toBe('evt-abc123');
  });

  test('invokes onError for global errors', () => {
    jest.spyOn(SentryCore, 'lastEventId').mockReturnValue('evt-xyz');
    const onError = jest.fn();

    render(
      <GlobalErrorBoundary fallback={props => <Fallback {...props} />} onError={onError}>
        <Ok />
      </GlobalErrorBoundary>,
    );

    const err = new Error('cb');
    act(() => {
      publishGlobalError({ error: err, isFatal: true, kind: 'onerror' });
    });

    expect(onError).toHaveBeenCalledWith(err, '', 'evt-xyz');
  });

  test('withGlobalErrorBoundary wraps a component', () => {
    const Wrapped = withGlobalErrorBoundary(Ok, { fallback: props => <Fallback {...props} /> });
    const { getByTestId, queryByTestId } = render(<Wrapped />);

    expect(queryByTestId('ok')).not.toBeNull();

    act(() => {
      publishGlobalError({ error: new Error('hoc-boom'), isFatal: true, kind: 'onerror' });
    });
    expect(getByTestId('fallback').props.children.join('')).toBe('fallback:hoc-boom');
  });
});

describe('hasInterestedSubscribers', () => {
  beforeEach(() => _resetGlobalErrorBus());

  test('returns false when no subscribers exist', () => {
    expect(hasInterestedSubscribers('onerror', true)).toBe(false);
    expect(hasInterestedSubscribers('onerror', false)).toBe(false);
    expect(hasInterestedSubscribers('onunhandledrejection', false)).toBe(false);
  });

  test('respects subscriber opt-ins', () => {
    render(
      <GlobalErrorBoundary fallback={() => <Text>fb</Text>} includeUnhandledRejections>
        <Text>x</Text>
      </GlobalErrorBoundary>,
    );

    expect(hasInterestedSubscribers('onerror', true)).toBe(true);
    expect(hasInterestedSubscribers('onerror', false)).toBe(false);
    expect(hasInterestedSubscribers('onunhandledrejection', false)).toBe(true);
  });
});
