/* eslint-disable max-lines */
import type { RequestInstrumentationOptions } from '@sentry/browser';
import { defaultRequestInstrumentationOptions, instrumentOutgoingRequests } from '@sentry/browser';
import {
  getActiveSpan,
  getCurrentScope,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SentryNonRecordingSpan,
  SPAN_STATUS_ERROR,
  spanToJSON,
  startIdleSpan,
} from '@sentry/core';
import type { Client, Event, Integration, PropagationContext, Scope, Span, StartSpanOptions } from '@sentry/types';
import { logger, uuid4 } from '@sentry/utils';

import type { RoutingInstrumentationInstance } from '../tracing/routingInstrumentation';
import { NATIVE } from '../wrapper';
import { NativeFramesInstrumentation } from './nativeframes';
import {
  adjustTransactionDuration,
  cancelInBackground,
  ignoreEmptyBackNavigation,
  onlySampleIfChildSpans,
  onThisSpanEnd,
} from './onSpanEndUtils';
import { UI_LOAD } from './ops';
import { StallTrackingInstrumentation } from './stalltracking';
import type { BeforeNavigate } from './types';

const SCOPE_SPAN_FIELD = '_sentrySpan';

type ScopeWithMaybeSpan = Scope & {
  [SCOPE_SPAN_FIELD]?: Span;
};

function clearActiveSpanFromScope(scope: ScopeWithMaybeSpan): void {
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete scope[SCOPE_SPAN_FIELD];
}

export interface ReactNativeTracingOptions extends RequestInstrumentationOptions {
  /**
   * @deprecated Replaced by idleTimeoutMs
   */
  idleTimeout: number;

  /**
   * @deprecated Replaced by maxTransactionDurationMs
   */
  maxTransactionDuration: number;

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

  /**
   * Track slow/frozen frames from the native layer and adds them as measurements to all transactions.
   */
  enableNativeFramesTracking: boolean;

  /**
   * Track when and how long the JS event loop stalls for. Adds stalls as measurements to all transactions.
   */
  enableStallTracking: boolean;

  /**
   * Trace User Interaction events like touch and gestures.
   */
  enableUserInteractionTracing: boolean;
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
  enableNativeFramesTracking: true,
  enableStallTracking: true,
  enableUserInteractionTracing: false,
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

  public nativeFramesInstrumentation?: NativeFramesInstrumentation;
  public stallTrackingInstrumentation?: StallTrackingInstrumentation;
  public useAppStartWithProfiler: boolean = false;

  private _inflightInteractionTransaction?: Span;

  private _currentRoute?: string;
  private _hasSetTracePropagationTargets: boolean;
  private _currentViewName: string | undefined;
  private _client: Client | undefined;

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
    this._client = client;
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
      enableStallTracking,
    } = this.options;

    const clientOptionsTracePropagationTargets = clientOptions && clientOptions.tracePropagationTargets;
    const tracePropagationTargets =
      clientOptionsTracePropagationTargets ||
      (this._hasSetTracePropagationTargets && thisOptionsTracePropagationTargets) ||
      DEFAULT_TRACE_PROPAGATION_TARGETS;

    this._enableNativeFramesTracking(client);

    if (enableStallTracking) {
      this.stallTrackingInstrumentation = new StallTrackingInstrumentation();
      this.stallTrackingInstrumentation.setup(client);
    }

    if (routingInstrumentation) {
      routingInstrumentation.registerRoutingInstrumentation(
        this._onRouteWillChange.bind(this),
        this.options.beforeNavigate,
        this._onConfirmRoute.bind(this),
      );
    } else {
      logger.log('[ReactNativeTracing] Not instrumenting route changes as routingInstrumentation has not been set.');
      this._createRouteTransaction({
        name: 'App Start',
        op: UI_LOAD,
      });
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
    return this.nativeFramesInstrumentation
      ? this.nativeFramesInstrumentation.processEvent(eventWithView)
      : eventWithView;
  }

  /**
   * Starts a new transaction for a user interaction.
   * @param userInteractionId Consists of `op` representation UI Event and `elementId` unique element identifier on current screen.
   */
  public startUserInteractionSpan(userInteractionId: { elementId: string | undefined; op: string }): Span | undefined {
    const client = this._client;
    if (!client) {
      return undefined;
    }

    const { elementId, op } = userInteractionId;
    if (!this.options.enableUserInteractionTracing) {
      logger.log('[ReactNativeTracing] User Interaction Tracing is disabled.');
      return undefined;
    }
    if (!this.options.routingInstrumentation) {
      logger.error(
        '[ReactNativeTracing] User Interaction Tracing is not working because no routing instrumentation is set.',
      );
      return undefined;
    }
    if (!elementId) {
      logger.log('[ReactNativeTracing] User Interaction Tracing can not create transaction with undefined elementId.');
      return undefined;
    }
    if (!this._currentRoute) {
      logger.log('[ReactNativeTracing] User Interaction Tracing can not create transaction without a current route.');
      return undefined;
    }

    const activeTransaction = getActiveSpan();
    const activeTransactionIsNotInteraction =
      !activeTransaction ||
      !this._inflightInteractionTransaction ||
      spanToJSON(activeTransaction).span_id !== spanToJSON(this._inflightInteractionTransaction).span_id;
    if (activeTransaction && activeTransactionIsNotInteraction) {
      logger.warn(
        `[ReactNativeTracing] Did not create ${op} transaction because active transaction ${
          spanToJSON(activeTransaction).description
        } exists on the scope.`,
      );
      return undefined;
    }

    const name = `${this._currentRoute}.${elementId}`;
    if (
      this._inflightInteractionTransaction &&
      spanToJSON(this._inflightInteractionTransaction).description === name &&
      spanToJSON(this._inflightInteractionTransaction).op === op
    ) {
      logger.warn(
        `[ReactNativeTracing] Did not create ${op} transaction because it the same transaction ${
          spanToJSON(this._inflightInteractionTransaction).description
        } already exists on the scope.`,
      );
      return undefined;
    }

    if (this._inflightInteractionTransaction) {
      // TODO: Check the interaction transactions spec, see if can be implemented differently
      // this._inflightInteractionTransaction.cancelIdleTimeout(undefined, { restartOnChildSpanChange: false });
      this._inflightInteractionTransaction = undefined;
    }

    const scope = getCurrentScope();
    const context: StartSpanOptions = {
      name,
      op,
      scope,
    };
    clearActiveSpanFromScope(scope);
    this._inflightInteractionTransaction = this._startIdleSpan(context);
    onThisSpanEnd(client, this._inflightInteractionTransaction, () => {
      this._inflightInteractionTransaction = undefined;
    });
    onlySampleIfChildSpans(client, this._inflightInteractionTransaction);
    logger.log(`[ReactNativeTracing] User Interaction Tracing Created ${op} transaction ${name}.`);
    return this._inflightInteractionTransaction;
  }

  /**
   * Enables or disables native frames tracking based on the `enableNativeFramesTracking` option.
   */
  private _enableNativeFramesTracking(client: Client): void {
    if (this.options.enableNativeFramesTracking && !NATIVE.enableNative) {
      // Do not enable native frames tracking if native is not available.
      logger.warn(
        '[ReactNativeTracing] NativeFramesTracking is not available on the Web, Expo Go and other platforms without native modules.',
      );
      return;
    }

    if (!this.options.enableNativeFramesTracking && NATIVE.enableNative) {
      // Disable native frames tracking when native available and option is false.
      NATIVE.disableNativeFramesTracking();
      return;
    }

    if (!this.options.enableNativeFramesTracking) {
      return;
    }

    NATIVE.enableNativeFramesTracking();
    this.nativeFramesInstrumentation = new NativeFramesInstrumentation();
    this.nativeFramesInstrumentation.setup(client);
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
    return this._createRouteTransaction();
  }

  /**
   * Save the current route to set it in context during event processing.
   */
  private _onConfirmRoute(currentViewName: string | undefined): void {
    this._currentViewName = currentViewName;
    this._currentRoute = currentViewName;
  }

  /** Create routing idle transaction. */
  private _createRouteTransaction({
    name,
    op,
  }: {
    name?: string;
    op?: string;
  } = {}): Span | undefined {
    if (!this._client) {
      logger.warn(`[ReactNativeTracing] Can't create route change span, missing client.`);
      return undefined;
    }

    if (this._inflightInteractionTransaction) {
      logger.log(
        `[ReactNativeTracing] Canceling ${
          spanToJSON(this._inflightInteractionTransaction).op
        } transaction because of a new navigation root span.`,
      );
      this._inflightInteractionTransaction.setStatus({ code: SPAN_STATUS_ERROR, message: 'cancelled' });
      this._inflightInteractionTransaction.end();
    }

    const { finalTimeoutMs } = this.options;

    const expandedContext: StartSpanOptions = {
      name: name || 'Route Change',
      op,
      forceTransaction: true,
      scope: getCurrentScope(),
    };

    const idleSpan = this._startIdleSpan(expandedContext);
    if (!idleSpan) {
      return undefined;
    }

    logger.log(`[ReactNativeTracing] Starting ${op || 'unknown op'} transaction "${name}" on scope`);

    adjustTransactionDuration(this._client, idleSpan, finalTimeoutMs);

    if (this.options.ignoreEmptyBackNavigationTransactions) {
      ignoreEmptyBackNavigation(this._client, idleSpan);
    }

    return idleSpan;
  }

  /**
   * Start app state aware idle transaction on the scope.
   */
  private _startIdleSpan(startSpanOption: StartSpanOptions, beforeSpanEnd?: (span: Span) => void): Span {
    if (!this._client) {
      logger.warn(`[ReactNativeTracing] Can't create idle span, missing client.`);
      return new SentryNonRecordingSpan();
    }

    getCurrentScope().setPropagationContext(generatePropagationContext());

    const { idleTimeoutMs, finalTimeoutMs } = this.options;
    const span = startIdleSpan(startSpanOption, {
      finalTimeout: finalTimeoutMs,
      idleTimeout: idleTimeoutMs,
      beforeSpanEnd,
    });
    cancelInBackground(this._client, span);
    return span;
  }
}

function generatePropagationContext(): PropagationContext {
  return {
    traceId: uuid4(),
    spanId: uuid4().substring(16),
  };
}

function addDefaultOpForSpanFrom(client: Client): void {
  client.on('spanStart', (span: Span) => {
    if (!spanToJSON(span).op) {
      span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'default');
    }
  });
}
