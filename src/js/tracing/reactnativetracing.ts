/* eslint-disable max-lines */
import type { RequestInstrumentationOptions } from '@sentry/browser';
import { defaultRequestInstrumentationOptions, instrumentOutgoingRequests } from '@sentry/browser';
import { getClient, SEMANTIC_ATTRIBUTE_SENTRY_OP, spanToJSON } from '@sentry/core';
import type { Client, Event, Integration, Span } from '@sentry/types';
import { logger } from '@sentry/utils';

import type { RoutingInstrumentationInstance } from '../tracing/routingInstrumentation';
import { startIdleNavigationSpan } from './span';
import type { BeforeNavigate } from './types';

export interface ReactNativeTracingOptions extends RequestInstrumentationOptions {
  /**
   * The time to wait in ms until the transaction will be finished. The transaction will use the end timestamp of
   * the last finished span as the endtime for the transaction.
   * Time is in ms.
   *
   * Default: 1000
   */
  idleTimeoutMs: number;

  /**
   * The maximum duration (transaction duration + idle timeout) of a transaction
   * before it will be marked as "deadline_exceeded".
   * If you never want to mark a transaction set it to 0.
   * Time is in ms.
   *
   * Default: 600000
   */
  finalTimeoutMs: number;

  /**
   * The routing instrumentation to be used with the tracing integration.
   * There is no routing instrumentation if nothing is passed.
   */
  routingInstrumentation?: RoutingInstrumentationInstance;

  /**
   * Does not sample transactions that are from routes that have been seen any more and don't have any spans.
   * This removes a lot of the clutter as most back navigation transactions are now ignored.
   *
   * Default: true
   */
  ignoreEmptyBackNavigationTransactions: boolean;

  /**
   * beforeNavigate is called before a navigation transaction is created and allows users to modify transaction
   * context data, or drop the transaction entirely (by setting `sampled = false` in the context).
   *
   * @param context: The context data which will be passed to `startTransaction` by default
   *
   * @returns A (potentially) modified context object, with `sampled = false` if the transaction should be dropped.
   */
  beforeNavigate: BeforeNavigate;
}

const DEFAULT_TRACE_PROPAGATION_TARGETS = ['localhost', /^\/(?!\/)/];

const defaultReactNativeTracingOptions: ReactNativeTracingOptions = {
  ...defaultRequestInstrumentationOptions,
  idleTimeout: 1000,
  maxTransactionDuration: 600,
  idleTimeoutMs: 1000,
  finalTimeoutMs: 600000,
  ignoreEmptyBackNavigationTransactions: true,
  beforeNavigate: context => context,
};

/**
 * Tracing integration for React Native.
 */
export class ReactNativeTracing implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'ReactNativeTracing';

  /**
   * @inheritDoc
   */
  public name: string = ReactNativeTracing.id;

  /** ReactNativeTracing options */
  public options: ReactNativeTracingOptions;

  public useAppStartWithProfiler: boolean = false;

  public currentRoute?: string;

  private _hasSetTracePropagationTargets: boolean;
  private _currentViewName: string | undefined;

  public constructor(options: Partial<ReactNativeTracingOptions> = {}) {
    this._hasSetTracePropagationTargets = !!(
      options &&
      // eslint-disable-next-line deprecation/deprecation
      options.tracePropagationTargets
    );

    this.options = {
      ...defaultReactNativeTracingOptions,
      ...options,
      finalTimeoutMs:
        options.finalTimeoutMs ??
        // eslint-disable-next-line deprecation/deprecation
        (typeof options.maxTransactionDuration === 'number'
          ? // eslint-disable-next-line deprecation/deprecation
            options.maxTransactionDuration * 1000
          : undefined) ??
        defaultReactNativeTracingOptions.finalTimeoutMs,
      idleTimeoutMs:
        options.idleTimeoutMs ??
        // eslint-disable-next-line deprecation/deprecation
        options.idleTimeout ??
        defaultReactNativeTracingOptions.idleTimeoutMs,
    };
  }

  /**
   *  Registers routing and request instrumentation.
   */
  public setup(client: Client): void {
    const clientOptions = client && client.getOptions();

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const {
      traceFetch,
      traceXHR,
      // eslint-disable-next-line deprecation/deprecation
      shouldCreateSpanForRequest,
      // eslint-disable-next-line deprecation/deprecation
      tracePropagationTargets: thisOptionsTracePropagationTargets,
      routingInstrumentation,
    } = this.options;

    const clientOptionsTracePropagationTargets = clientOptions && clientOptions.tracePropagationTargets;
    const tracePropagationTargets =
      clientOptionsTracePropagationTargets ||
      (this._hasSetTracePropagationTargets && thisOptionsTracePropagationTargets) ||
      DEFAULT_TRACE_PROPAGATION_TARGETS;

    if (routingInstrumentation) {
      routingInstrumentation.registerRoutingInstrumentation(
        this._onRouteWillChange.bind(this),
        this.options.beforeNavigate,
        this._onConfirmRoute.bind(this),
      );
    } else {
      logger.log('[ReactNativeTracing] Not instrumenting route changes as routingInstrumentation has not been set.');
    }

    addDefaultOpForSpanFrom(client);

    instrumentOutgoingRequests({
      traceFetch,
      traceXHR,
      shouldCreateSpanForRequest,
      tracePropagationTargets,
    });
  }

  /**
   * @inheritdoc
   */
  public processEvent(event: Event): Promise<Event> | Event {
    const eventWithView = this._getCurrentViewEventProcessor(event);
    return eventWithView;
  }

  /**
   *  Sets the current view name into the app context.
   *  @param event Le event.
   */
  private _getCurrentViewEventProcessor(event: Event): Event {
    if (event.contexts && this._currentViewName) {
      event.contexts.app = { view_names: [this._currentViewName], ...event.contexts.app };
    }
    return event;
  }

  /** To be called when the route changes, but BEFORE the components of the new route mount. */
  private _onRouteWillChange(): Span | undefined {
    return startIdleNavigationSpan(
      {
        name: 'Route Change',
      },
      {
        finalTimeout: this.options.finalTimeoutMs,
        idleTimeout: this.options.idleTimeoutMs,
        ignoreEmptyBackNavigationTransactions: this.options.ignoreEmptyBackNavigationTransactions,
      },
    );
  }

  /**
   * Save the current route to set it in context during event processing.
   */
  private _onConfirmRoute(currentViewName: string | undefined): void {
    this._currentViewName = currentViewName;
    this.currentRoute = currentViewName;
  }
}

/**
 * Returns the current React Native Tracing integration.
 */
export function getCurrentReactNativeTracingIntegration(): ReactNativeTracing | undefined {
  const client = getClient();
  if (!client) {
    return undefined;
  }

  return client.getIntegrationByName(ReactNativeTracing.id) as ReactNativeTracing | undefined;
}

function addDefaultOpForSpanFrom(client: Client): void {
  client.on('spanStart', (span: Span) => {
    if (!spanToJSON(span).op) {
      span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'default');
    }
  });
}
