/* eslint-disable max-lines */
import { instrumentOutgoingRequests } from '@sentry/browser';
import { getClient, getCurrentScope } from '@sentry/core';
import type { Client, Event, Integration, StartSpanOptions } from '@sentry/types';
import { logger } from '@sentry/utils';

import type { RoutingInstrumentationInstance } from './routingInstrumentation';
import { addDefaultOpForSpanFrom, startIdleNavigationSpan } from './span';

export const INTEGRATION_NAME = 'ReactNativeTracing';

export interface ReactNativeTracingOptions {
  /**
   * The time that has to pass without any span being created.
   * If this time is exceeded, the idle span will finish.
   *
   * @default 1_000 (ms)
   */
  idleTimeoutMs: number;

  /**
   * The max. time an idle span may run.
   * If this time is exceeded, the idle span will finish no matter what.
   *
   * @default 60_0000 (ms)
   */
  finalTimeoutMs: number;

  /**
   * Flag to disable patching all together for fetch requests.
   *
   * @default true
   */
  traceFetch: boolean;

  /**
   * Flag to disable patching all together for xhr requests.
   *
   * @default true
   */
  traceXHR: boolean;

  /**
   * If true, Sentry will capture http timings and add them to the corresponding http spans.
   *
   * @default true
   */
  enableHTTPTimings: boolean;

  /**
   * The routing instrumentation to be used with the tracing integration.
   * There is no routing instrumentation if nothing is passed.
   */
  routingInstrumentation?: RoutingInstrumentationInstance;

  /**
   * Does not sample transactions that are from routes that have been seen any more and don't have any spans.
   * This removes a lot of the clutter as most back navigation transactions are now ignored.
   *
   * @default true
   */
  ignoreEmptyBackNavigationTransactions: boolean;

  /**
   * A callback which is called before a span for a navigation is started.
   * It receives the options passed to `startSpan`, and expects to return an updated options object.
   */
  beforeStartSpan?: (options: StartSpanOptions) => StartSpanOptions;

  /**
   * This function will be called before creating a span for a request with the given url.
   * Return false if you don't want a span for the given url.
   *
   * @default (url: string) => true
   */
  shouldCreateSpanForRequest?(this: void, url: string): boolean;
}

const DEFAULT_TRACE_PROPAGATION_TARGETS = ['localhost', /^\/(?!\/)/];
export const DEFAULT_NAVIGATION_SPAN_NAME = 'Route Change';

const defaultReactNativeTracingOptions: ReactNativeTracingOptions = {
  idleTimeoutMs: 1_000,
  finalTimeoutMs: 60_0000,
  traceFetch: true,
  traceXHR: true,
  enableHTTPTimings: true,
  ignoreEmptyBackNavigationTransactions: true,
};

type ReactNativeTracingState = {
  currentRoute: string | undefined;
};

export const reactNativeTracingIntegration = (
  options: Partial<ReactNativeTracingOptions> = {},
): Integration & {
  options: ReactNativeTracingOptions;
  state: ReactNativeTracingState;
} => {
  const state: ReactNativeTracingState = {
    currentRoute: undefined,
  };

  const finalOptions = {
    ...defaultReactNativeTracingOptions,
    ...options,
    beforeStartSpan: options.beforeStartSpan ?? ((options: StartSpanOptions) => options),
    finalTimeoutMs: options.finalTimeoutMs ?? defaultReactNativeTracingOptions.finalTimeoutMs,
    idleTimeoutMs: options.idleTimeoutMs ?? defaultReactNativeTracingOptions.idleTimeoutMs,
  };

  const setup = (client: Client): void => {
    if (finalOptions.routingInstrumentation) {
      const idleNavigationSpanOptions = {
        finalTimeout: finalOptions.finalTimeoutMs,
        idleTimeout: finalOptions.idleTimeoutMs,
        ignoreEmptyBackNavigationTransactions: finalOptions.ignoreEmptyBackNavigationTransactions,
      };
      finalOptions.routingInstrumentation.registerRoutingInstrumentation(
        navigationInstrumentationOptions =>
          startIdleNavigationSpan(
            finalOptions.beforeStartSpan({
              name: DEFAULT_NAVIGATION_SPAN_NAME,
              op: 'navigation',
              forceTransaction: true,
              scope: getCurrentScope(),
              ...navigationInstrumentationOptions,
            }),
            idleNavigationSpanOptions,
          ),
        () => {
          // no-op, replaced by beforeStartSpan, will be removed in the future
        },
        (currentViewName: string | undefined) => {
          state.currentRoute = currentViewName;
        },
      );
    } else {
      logger.log(`[${INTEGRATION_NAME}] Not instrumenting route changes as routingInstrumentation has not been set.`);
    }

    addDefaultOpForSpanFrom(client);

    instrumentOutgoingRequests({
      traceFetch: finalOptions.traceFetch,
      traceXHR: finalOptions.traceXHR,
      shouldCreateSpanForRequest: finalOptions.shouldCreateSpanForRequest,
      tracePropagationTargets: client.getOptions().tracePropagationTargets || DEFAULT_TRACE_PROPAGATION_TARGETS,
    });
  };

  const processEvent = (event: Event): Event => {
    if (event.contexts && state.currentRoute) {
      event.contexts.app = { view_names: [state.currentRoute], ...event.contexts.app };
    }
    return event;
  };

  return {
    name: INTEGRATION_NAME,
    setup,
    processEvent,
    options: finalOptions,
    state,
  };
};

export type ReactNativeTracingIntegration = ReturnType<typeof reactNativeTracingIntegration>;

/**
 * Returns the current React Native Tracing integration.
 */
export function getCurrentReactNativeTracingIntegration(): ReactNativeTracingIntegration | undefined {
  const client = getClient();
  if (!client) {
    return undefined;
  }

  return getReactNativeTracingIntegration(client);
}

/**
 * Returns React Native Tracing integration of given client.
 */
export function getReactNativeTracingIntegration(client: Client): ReactNativeTracingIntegration | undefined {
  return client.getIntegrationByName(INTEGRATION_NAME) as ReactNativeTracingIntegration | undefined;
}
