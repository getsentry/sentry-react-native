import { getActiveSpan, Span as SpanClass, spanToJSON, startInactiveSpan } from '@sentry/core';
import type { Span,StartSpanOptions  } from '@sentry/types';
import { logger } from '@sentry/utils';
import React from 'react';
import type { HostComponent} from 'react-native';
import { requireNativeComponent,UIManager, View } from 'react-native';

import { notWeb } from '../utils/environment';

const RNSentryOnDrawReporterClass = 'RNSentryOnDrawReporter';

const nativeComponentExists = UIManager.hasViewManagerConfig(RNSentryOnDrawReporterClass)
let nativeComponentMissingLogged = false;

interface RNSentryOnDrawNextFrameEvent {
  newFrameTimestampInSeconds: number;
}

interface RNSentryOnDrawReporterProps {
  children?: React.ReactNode;
  onDrawNextFrame: (event: { nativeEvent: RNSentryOnDrawNextFrameEvent }) => void;
}

/**
 * This is a fallback component for environments where the native component is not available.
 */
class RNSentryOnDrawReporterNoop extends React.Component<RNSentryOnDrawReporterProps> {
  public render(): React.ReactNode {
    return (
      <View {...this.props} />
    );
  }
}

/**
 * Native component that reports the on draw timestamp.
 */
const RNSentryOnDrawReporter: HostComponent<RNSentryOnDrawReporterProps> | typeof RNSentryOnDrawReporterNoop = nativeComponentExists
  ? requireNativeComponent(RNSentryOnDrawReporterClass)
  : RNSentryOnDrawReporterNoop;

export const UNKNOWN_COMPONENT = 'unknown';

/**
 * Adds wrapper for manual TTID tracing.
 *
 * TTID will be recorded on the draw of the native component.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withTimeToInitialDisplay<P extends Record<string, any>>(
  WrappedComponent: React.ComponentType<P>,
  options?: { name?: string },
): React.FC<P> {
  const componentDisplayName =
    (options && options.name) || WrappedComponent.displayName || WrappedComponent.name || UNKNOWN_COMPONENT;

  const Wrapped: React.FC<P> = (props: P) => (
    <TimeToDisplay name={componentDisplayName}>
      <WrappedComponent {...props} />
    </TimeToDisplay>
  );

  Wrapped.displayName = `withTimeToInitialDisplay(${componentDisplayName})`;

  // Copy over static methods from Wrapped component to Profiler HOC
  // See: https://reactjs.org/docs/higher-order-components.html#static-methods-must-be-copied-over
  // hoistNonReactStatics(Wrapped, WrappedComponent);
  return Wrapped;
}

/**
 * Adds wrapper for manual TTFD tracing.
 *
 * TTFD will be recorded on the draw of the native component.
 */
// export function withTtfdOnDraw(recordNow: boolean = true) {

// }

export type OnDrawReporterProps = {
  children?: React.ReactNode;
  name?: string;
  initialDisplay?: boolean;
  // fullDisplay?: boolean;
};

/**
 * Wrapper for manual TTID and TTFD tracing.
 *
 * The component native implementation wait for the next frame after draw to mark the TTID/TTFD.
 */
export function TimeToDisplay(props: OnDrawReporterProps = {
  initialDisplay: true,
}): React.ReactElement {
  if (__DEV__ && !nativeComponentMissingLogged && !nativeComponentExists && !notWeb()) {
    nativeComponentMissingLogged = true;
    logger.error('RNSentryOnDrawReporter is not available. Native Sentry modules is not loaded. Update your native build or report an issue at https://github.com/getsentry/sentry-react-native');
  }

  const onDrawNextFrame = (event: { nativeEvent: RNSentryOnDrawNextFrameEvent }): void => {
    const activeSpan = getActiveSpan();
    if (!activeSpan) {
      return;
    }

    if (!(activeSpan instanceof SpanClass)) {
      return;
    }

    const existingTtidSpan = activeSpan.spanRecorder?.spans.find((span) => spanToJSON(span).op === 'ui.load.initial_display');

    const ttidSpan = existingTtidSpan || startInactiveSpan({
      op: 'ui.load.initial_display',
      name: 'Time To Initial Display',
      startTimestamp: spanToJSON(activeSpan).start_timestamp,
    });
    if (!ttidSpan) {
      return; // performance disabled
    }

    if (spanToJSON(ttidSpan).timestamp) {
      logger.warn(`${spanToJSON(ttidSpan).description} span end timestamp manually overwritten`);
      ttidSpan.endTimestamp = event.nativeEvent.newFrameTimestampInSeconds;
    } else {
      ttidSpan.end(event.nativeEvent.newFrameTimestampInSeconds);
    }
  }

  return (
    <RNSentryOnDrawReporter onDrawNextFrame={onDrawNextFrame}>
      {props.children}
    </RNSentryOnDrawReporter >
  );
}

/**
 * Starts a new span for the initial display of the application.
 */
export function startTimeToDisplaySpans(options: Exclude<StartSpanOptions, 'op'>): {
  initialDisplaySpan: Span | undefined;
  fullDisplaySpan: Span | undefined;
} {
  const initialDisplaySpan = startInactiveSpan({
    op: 'ui.load.initial_display',
    ...options,
  });

  return {
    initialDisplaySpan,
    fullDisplaySpan: undefined,
  };
}
