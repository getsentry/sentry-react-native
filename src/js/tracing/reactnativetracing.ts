/* eslint-disable max-lines */
import type { RequestInstrumentationOptions } from '@sentry/browser';
import { defaultRequestInstrumentationOptions, instrumentOutgoingRequests } from '@sentry/browser';
import type { Hub, IdleTransaction, Transaction } from '@sentry/core';
import { getActiveTransaction, getCurrentHub, spanToJSON, startIdleTransaction } from '@sentry/core';
import type {
  Event,
  EventProcessor,
  Integration,
  Span,
  Transaction as TransactionType,
  TransactionContext,
} from '@sentry/types';
import { logger } from '@sentry/utils';

import type { ReactNativeClient } from '../client';
import { APP_START_COLD, APP_START_WARM } from '../measurements';
import type { NativeAppStartResponse } from '../NativeRNSentry';
import type { ReactNativeClientOptions } from '../options';
import type { RoutingInstrumentationInstance } from '../tracing/routingInstrumentation';
import { NATIVE } from '../wrapper';
import { NativeFramesInstrumentation } from './nativeframes';
import { APP_START_COLD as APP_START_COLD_OP, APP_START_WARM as APP_START_WARM_OP, UI_LOAD } from './ops';
import { StallTrackingInstrumentation } from './stalltracking';
import { cancelInBackground, onlySampleIfChildSpans } from './transaction';
import type { BeforeNavigate, RouteChangeContextData } from './types';
import {
  adjustTransactionDuration,
  getBundleStartTimestampMs,
  getTimeOriginMilliseconds,
  isNearToNow,
  setSpanDurationAsMeasurement,
} from './utils';

export const reactNativeTracingIntegration = (options?: Partial<ReactNativeTracingOptions>): ReactNativeTracing => {
  return new ReactNativeTracing(options);
};

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
   * @deprecated Use `Sentry.init({ enableAppStartTracking })` instead.
   */
  enableAppStartTracking: boolean;

  /**
   * @deprecated Use `Sentry.init({ enableNativeFramesTracking })` instead.
   */
  enableNativeFramesTracking: boolean;

  /**
   * @deprecated Use `Sentry.init({ enableStallTracking })` instead.
   */
  enableStallTracking: boolean;

  /**
   * @deprecated Use `Sentry.init({ enableUserInteractionTracing })` instead.
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
  enableAppStartTracking: true,
  enableNativeFramesTracking: true,
  enableStallTracking: true,
  enableUserInteractionTracing: false,
};

/**
 * @deprecated Use `Sentry.reactNativeTracingIntegration()` instead.
 */
export class ReactNativeTracing implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'ReactNativeTracing';
  /** We filter out App starts more than 60s */
  private static _maxAppStart: number = 60000;
  /** We filter out App starts which timestamp is 60s and more before the transaction start */
  private static _maxAppStartBeforeTransactionMs: number = 60000;
  /**
   * @inheritDoc
   */
  public name: string = ReactNativeTracing.id;

  /** ReactNativeTracing options */
  public options: ReactNativeTracingOptions;

  public nativeFramesInstrumentation?: NativeFramesInstrumentation;
  public stallTrackingInstrumentation?: StallTrackingInstrumentation;
  public useAppStartWithProfiler: boolean = false;

  private _inflightInteractionTransaction?: IdleTransaction;
  private _getCurrentHub?: () => Hub;
  private _awaitingAppStartData?: NativeAppStartResponse;
  private _appStartFinishTimestamp?: number;
  private _currentRoute?: string;
  private _hasSetTracePropagationTargets: boolean;
  private _hasSetTracingOrigins: boolean;
  private _currentViewName: string | undefined;
  private _firstConstructorCallTimestampMs: number | undefined;

  public constructor(options: Partial<ReactNativeTracingOptions> = {}) {
    this._hasSetTracePropagationTargets = !!(
      options &&
      // eslint-disable-next-line deprecation/deprecation
      options.tracePropagationTargets
    );
    this._hasSetTracingOrigins = !!(
      options &&
      // eslint-disable-next-line deprecation/deprecation
      options.tracingOrigins
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
  public async setupOnce(
    addGlobalEventProcessor: (callback: EventProcessor) => void,
    getCurrentHub: () => Hub,
  ): Promise<void> {
    const hub = getCurrentHub();
    const client = hub.getClient<ReactNativeClient>();
    const clientOptions = client && client.getOptions();

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const {
      traceFetch,
      traceXHR,
      // eslint-disable-next-line deprecation/deprecation
      tracingOrigins,
      shouldCreateSpanForRequest,
      // eslint-disable-next-line deprecation/deprecation
      tracePropagationTargets: thisOptionsTracePropagationTargets,
      routingInstrumentation,
      enableAppStartTracking,
      enableStallTracking,
    } = this.options;

    this._getCurrentHub = getCurrentHub;

    const clientOptionsTracePropagationTargets = clientOptions && clientOptions.tracePropagationTargets;
    // There are three ways to configure tracePropagationTargets:
    // 1. via top level client option `tracePropagationTargets`
    // 2. via ReactNativeTracing option `tracePropagationTargets`
    // 3. via ReactNativeTracing option `tracingOrigins` (deprecated)
    //
    // To avoid confusion, favour top level client option `tracePropagationTargets`, and fallback to
    // ReactNativeTracing option `tracePropagationTargets` and then `tracingOrigins` (deprecated).
    //
    // If both 1 and either one of 2 or 3 are set (from above), we log out a warning.
    const tracePropagationTargets =
      clientOptionsTracePropagationTargets ||
      (this._hasSetTracePropagationTargets && thisOptionsTracePropagationTargets) ||
      (this._hasSetTracingOrigins && tracingOrigins) ||
      DEFAULT_TRACE_PROPAGATION_TARGETS;
    if (
      __DEV__ &&
      (this._hasSetTracePropagationTargets || this._hasSetTracingOrigins) &&
      clientOptionsTracePropagationTargets
    ) {
      logger.warn(
        '[ReactNativeTracing] The `tracePropagationTargets` option was set in the ReactNativeTracing integration and top level `Sentry.init`. The top level `Sentry.init` value is being used.',
      );
    }

    if (clientOptions?.enableAppStartTracking ?? enableAppStartTracking) {
      this._instrumentAppStart(clientOptions).then(undefined, (reason: unknown) => {
        logger.error(`[ReactNativeTracing] Error while instrumenting app start:`, reason);
      });
    }

    this._enableNativeFramesTracking(addGlobalEventProcessor, clientOptions);

    if (clientOptions?.enableStallTracking ?? enableStallTracking) {
      this.stallTrackingInstrumentation = new StallTrackingInstrumentation();
    }

    if (routingInstrumentation) {
      routingInstrumentation.registerRoutingInstrumentation(
        this._onRouteWillChange.bind(this),
        this.options.beforeNavigate,
        this._onConfirmRoute.bind(this),
      );
    } else {
      logger.log('[ReactNativeTracing] Not instrumenting route changes as routingInstrumentation has not been set.');
    }

    addGlobalEventProcessor(this._getCurrentViewEventProcessor.bind(this));

    instrumentOutgoingRequests({
      traceFetch,
      traceXHR,
      shouldCreateSpanForRequest,
      tracePropagationTargets,
    });
  }

  /**
   * To be called on a transaction start. Can have async methods
   */
  public onTransactionStart(transaction: Transaction): void {
    if (isNearToNow(transaction.startTimestamp)) {
      // Only if this method is called at or within margin of error to the start timestamp.
      this.nativeFramesInstrumentation?.onTransactionStart(transaction);
      this.stallTrackingInstrumentation?.onTransactionStart(transaction);
    } else {
      logger.warn(
        `[ReactNativeTracing] onTransactionStart called with delay (larger than margin of error) for transaction ${
          transaction.description
        } (${transaction.spanContext().spanId}). Not fetching native frames or tracking stalls.`,
      );
    }
  }

  /**
   * To be called on a transaction finish. Cannot have async methods.
   */
  public onTransactionFinish(transaction: Transaction, endTimestamp?: number): void {
    this.nativeFramesInstrumentation?.onTransactionFinish(transaction);
    this.stallTrackingInstrumentation?.onTransactionFinish(transaction, endTimestamp);
  }

  /**
   * Called by the ReactNativeProfiler component on first component mount.
   */
  public onAppStartFinish(endTimestamp: number): void {
    this._appStartFinishTimestamp = endTimestamp;
  }

  /**
   * Sets the root component first constructor call timestamp.
   */
  public setRootComponentFirstConstructorCallTimestampMs(timestamp: number): void {
    this._firstConstructorCallTimestampMs = timestamp;
  }

  /**
   * Starts a new transaction for a user interaction.
   * @param userInteractionId Consists of `op` representation UI Event and `elementId` unique element identifier on current screen.
   */
  public startUserInteractionTransaction(userInteractionId: {
    elementId: string | undefined;
    op: string;
  }): TransactionType | undefined {
    const { elementId, op } = userInteractionId;

    const clientOptions = this._getCurrentHub?.()?.getClient<ReactNativeClient>()?.getOptions();

    if (!(clientOptions?.enableUserInteractionTracing ?? this.options.enableUserInteractionTracing)) {
      logger.log('[ReactNativeTracing] User Interaction Tracing is disabled.');
      return;
    }
    if (!this.options.routingInstrumentation) {
      logger.error(
        '[ReactNativeTracing] User Interaction Tracing is not working because no routing instrumentation is set.',
      );
      return;
    }
    if (!elementId) {
      logger.log('[ReactNativeTracing] User Interaction Tracing can not create transaction with undefined elementId.');
      return;
    }
    if (!this._currentRoute) {
      logger.log('[ReactNativeTracing] User Interaction Tracing can not create transaction without a current route.');
      return;
    }

    const hub = this._getCurrentHub?.() || getCurrentHub();
    const activeTransaction = getActiveTransaction(hub);
    const activeTransactionIsNotInteraction =
      activeTransaction?.spanId !== this._inflightInteractionTransaction?.spanId;
    if (activeTransaction && activeTransactionIsNotInteraction) {
      logger.warn(
        `[ReactNativeTracing] Did not create ${op} transaction because active transaction ${activeTransaction.name} exists on the scope.`,
      );
      return;
    }

    if (this._inflightInteractionTransaction) {
      this._inflightInteractionTransaction.cancelIdleTimeout(undefined, { restartOnChildSpanChange: false });
      this._inflightInteractionTransaction = undefined;
    }

    const name = `${this._currentRoute}.${elementId}`;
    const context: TransactionContext = {
      name,
      op,
      trimEnd: true,
    };
    this._inflightInteractionTransaction = this._startIdleTransaction(context);
    this._inflightInteractionTransaction.registerBeforeFinishCallback((transaction: IdleTransaction) => {
      this._inflightInteractionTransaction = undefined;
      this.onTransactionFinish(transaction);
    });
    this._inflightInteractionTransaction.registerBeforeFinishCallback(onlySampleIfChildSpans);
    this.onTransactionStart(this._inflightInteractionTransaction);
    logger.log(`[ReactNativeTracing] User Interaction Tracing Created ${op} transaction ${name}.`);
    return this._inflightInteractionTransaction;
  }

  /**
   * Enables or disables native frames tracking based on the `enableNativeFramesTracking` option.
   */
  private _enableNativeFramesTracking(
    addGlobalEventProcessor: (callback: EventProcessor) => void,
    clientOptions: ReactNativeClientOptions | undefined,
  ): void {
    const enableNativeFramesTracking =
      clientOptions?.enableNativeFramesTracking ?? this.options.enableNativeFramesTracking;
    if (enableNativeFramesTracking && !NATIVE.enableNative) {
      // Do not enable native frames tracking if native is not available.
      logger.warn(
        '[ReactNativeTracing] NativeFramesTracking is not available on the Web, Expo Go and other platforms without native modules.',
      );
      return;
    }

    if (!enableNativeFramesTracking && NATIVE.enableNative) {
      // Disable native frames tracking when native available and option is false.
      NATIVE.disableNativeFramesTracking();
      return;
    }

    if (!enableNativeFramesTracking) {
      return;
    }

    NATIVE.enableNativeFramesTracking();
    this.nativeFramesInstrumentation = new NativeFramesInstrumentation(addGlobalEventProcessor, () => {
      const self = getCurrentHub().getIntegration(ReactNativeTracing);

      if (self) {
        return !!self.nativeFramesInstrumentation;
      }

      return false;
    });
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

  /**
   * Returns the App Start Duration in Milliseconds. Also returns undefined if not able do
   * define the duration.
   */
  private _getAppStartDurationMilliseconds(appStartTimestampMs: number): number | undefined {
    if (!this._appStartFinishTimestamp) {
      return undefined;
    }
    return this._appStartFinishTimestamp * 1000 - appStartTimestampMs;
  }

  /**
   * Instruments the app start measurements on the first route transaction.
   * Starts a route transaction if there isn't routing instrumentation.
   */
  private async _instrumentAppStart(clientOptions: ReactNativeClientOptions | undefined): Promise<void> {
    if (!(clientOptions?.enableAppStartTracking ?? this.options.enableAppStartTracking) || !NATIVE.enableNative) {
      return;
    }

    const appStart = await NATIVE.fetchNativeAppStart();

    if (!appStart) {
      logger.warn('[ReactNativeTracing] Not instrumenting App Start because native returned null.');
      return;
    }

    if (appStart.has_fetched) {
      logger.warn('[ReactNativeTracing] Not instrumenting App Start because this start was already reported.');
      return;
    }

    if (!this.useAppStartWithProfiler) {
      logger.warn('[ReactNativeTracing] `Sentry.wrap` not detected, using JS context init as app start end.');
      this._appStartFinishTimestamp = getTimeOriginMilliseconds() / 1000;
    }

    if (this.options.routingInstrumentation) {
      this._awaitingAppStartData = appStart;
    } else {
      const idleTransaction = this._createRouteTransaction({
        name: 'App Start',
        op: UI_LOAD,
      });

      if (idleTransaction) {
        this._addAppStartData(idleTransaction, appStart);
      }
    }
  }

  /**
   * Adds app start measurements and starts a child span on a transaction.
   */
  private _addAppStartData(transaction: IdleTransaction, appStart: NativeAppStartResponse): void {
    const appStartTimestampMs = appStart.app_start_timestamp_ms;
    if (!appStartTimestampMs) {
      logger.warn('App start timestamp could not be loaded from the native layer.');
      return;
    }

    const isAppStartWithinBounds =
      appStartTimestampMs >=
      getTransactionStartTimestampMs(transaction) - ReactNativeTracing._maxAppStartBeforeTransactionMs;
    if (!__DEV__ && !isAppStartWithinBounds) {
      logger.warn('[ReactNativeTracing] App start timestamp is too far in the past to be used for app start span.');
      return;
    }

    const appStartDurationMilliseconds = this._getAppStartDurationMilliseconds(appStartTimestampMs);
    if (!appStartDurationMilliseconds) {
      logger.warn('[ReactNativeTracing] App start end has not been recorded, not adding app start span.');
      return;
    }

    // we filter out app start more than 60s.
    // this could be due to many different reasons.
    // we've seen app starts with hours, days and even months.
    if (appStartDurationMilliseconds >= ReactNativeTracing._maxAppStart) {
      logger.warn('[ReactNativeTracing] App start duration is over a minute long, not adding app start span.');
      return;
    }

    const appStartTimeSeconds = appStartTimestampMs / 1000;

    transaction.startTimestamp = appStartTimeSeconds;

    const maybeTtidSpan = transaction.spanRecorder?.spans.find(span => span.op === 'ui.load.initial_display');
    if (maybeTtidSpan) {
      maybeTtidSpan.startTimestamp = appStartTimeSeconds;
      setSpanDurationAsMeasurement('time_to_initial_display', maybeTtidSpan);
    }

    const maybeTtfdSpan = transaction.spanRecorder?.spans.find(span => span.op === 'ui.load.full_display');
    if (maybeTtfdSpan) {
      maybeTtfdSpan.startTimestamp = appStartTimeSeconds;
      setSpanDurationAsMeasurement('time_to_full_display', maybeTtfdSpan);
    }

    const op = appStart.type === 'cold' ? APP_START_COLD_OP : APP_START_WARM_OP;
    const appStartSpan = transaction.startChild({
      description: appStart.type === 'cold' ? 'Cold App Start' : 'Warm App Start',
      op,
      startTimestamp: appStartTimeSeconds,
      endTimestamp: this._appStartFinishTimestamp,
    });
    this._addJSExecutionBeforeRoot(appStartSpan);
    this._addNativeSpansTo(appStartSpan, appStart.spans);

    const measurement = appStart.type === 'cold' ? APP_START_COLD : APP_START_WARM;
    transaction.setMeasurement(measurement, appStartDurationMilliseconds, 'millisecond');
  }

  /**
   * Adds JS Execution before React Root. If `Sentry.wrap` is not used, create a span for the start of JS Bundle execution.
   */
  private _addJSExecutionBeforeRoot(appStartSpan: Span): void {
    const bundleStartTimestampMs = getBundleStartTimestampMs();
    if (!bundleStartTimestampMs) {
      return;
    }

    if (!this._firstConstructorCallTimestampMs) {
      logger.warn('Missing the root component first constructor call timestamp.');
      appStartSpan.startChild({
        description: 'JS Bundle Execution Start',
        op: appStartSpan.op,
        startTimestamp: bundleStartTimestampMs / 1000,
        endTimestamp: bundleStartTimestampMs / 1000,
      });
      return;
    }

    appStartSpan.startChild({
      description: 'JS Bundle Execution Before React Root',
      op: appStartSpan.op,
      startTimestamp: bundleStartTimestampMs / 1000,
      endTimestamp: this._firstConstructorCallTimestampMs / 1000,
    });
  }

  /**
   * Adds native spans to the app start span.
   */
  private _addNativeSpansTo(appStartSpan: Span, nativeSpans: NativeAppStartResponse['spans']): void {
    nativeSpans.forEach(span => {
      if (span.description === 'UIKit init') {
        return this._createUIKitSpan(appStartSpan, span);
      }

      appStartSpan.startChild({
        op: appStartSpan.op,
        description: span.description,
        startTimestamp: span.start_timestamp_ms / 1000,
        endTimestamp: span.end_timestamp_ms / 1000,
      });
    });
  }

  /**
   * UIKit init is measured by the native layers till the native SDK start
   * RN initializes the native SDK later, the end timestamp would be wrong
   */
  private _createUIKitSpan(parentSpan: Span, nativeUIKitSpan: NativeAppStartResponse['spans'][number]): void {
    const bundleStart = getBundleStartTimestampMs();

    // If UIKit init ends after the bundle start, the native SDK was auto-initialized
    // and so the end timestamp is incorrect.
    // The timestamps can't equal, as RN initializes after UIKit.
    if (bundleStart && bundleStart < nativeUIKitSpan.end_timestamp_ms) {
      parentSpan.startChild({
        op: parentSpan.op,
        description: 'UIKit Init to JS Exec Start',
        startTimestamp: nativeUIKitSpan.start_timestamp_ms / 1000,
        endTimestamp: bundleStart / 1000,
      });
    } else {
      parentSpan.startChild({
        op: parentSpan.op,
        description: 'UIKit Init',
        startTimestamp: nativeUIKitSpan.start_timestamp_ms / 1000,
        endTimestamp: nativeUIKitSpan.end_timestamp_ms / 1000,
      });
    }
  }

  /** To be called when the route changes, but BEFORE the components of the new route mount. */
  private _onRouteWillChange(context: TransactionContext): TransactionType | undefined {
    return this._createRouteTransaction(context);
  }

  /**
   * Creates a breadcrumb and sets the current route as a tag.
   */
  private _onConfirmRoute(context: TransactionContext): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    this._currentRoute = context.data?.route?.name;

    this._getCurrentHub?.().configureScope(scope => {
      if (context.data) {
        const contextData = context.data as RouteChangeContextData;

        scope.addBreadcrumb({
          category: 'navigation',
          type: 'navigation',
          // We assume that context.name is the name of the route.
          message: `Navigation to ${context.name}`,
          data: {
            from: contextData.previousRoute?.name,
            to: contextData.route.name,
          },
        });
      }

      this._currentViewName = context.name;
      /**
       * @deprecated tag routing.route.name will be removed in the future.
       */
      scope.setTag('routing.route.name', context.name);
    });
  }

  /** Create routing idle transaction. */
  private _createRouteTransaction(context: TransactionContext): IdleTransaction | undefined {
    if (!this._getCurrentHub) {
      logger.warn(`[ReactNativeTracing] Did not create ${context.op} transaction because _getCurrentHub is invalid.`);
      return undefined;
    }

    if (this._inflightInteractionTransaction) {
      logger.log(
        `[ReactNativeTracing] Canceling ${this._inflightInteractionTransaction.op} transaction because navigation ${context.op}.`,
      );
      this._inflightInteractionTransaction.setStatus('cancelled');
      this._inflightInteractionTransaction.finish();
    }

    const { finalTimeoutMs } = this.options;

    const expandedContext = {
      ...context,
      trimEnd: true,
    };

    const idleTransaction = this._startIdleTransaction(expandedContext);

    this.onTransactionStart(idleTransaction);

    logger.log(`[ReactNativeTracing] Starting ${context.op} transaction "${context.name}" on scope`);

    idleTransaction.registerBeforeFinishCallback((transaction, endTimestamp) => {
      this.onTransactionFinish(transaction, endTimestamp);
    });

    idleTransaction.registerBeforeFinishCallback(transaction => {
      if (this.options.enableAppStartTracking && this._awaitingAppStartData) {
        transaction.op = UI_LOAD;
        this._addAppStartData(transaction, this._awaitingAppStartData);

        this._awaitingAppStartData = undefined;
      }
    });

    idleTransaction.registerBeforeFinishCallback((transaction, endTimestamp) => {
      adjustTransactionDuration(finalTimeoutMs, transaction, endTimestamp);
    });

    if (this.options.ignoreEmptyBackNavigationTransactions) {
      idleTransaction.registerBeforeFinishCallback(transaction => {
        if (
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          transaction.data?.route?.hasBeenSeen &&
          (!transaction.spanRecorder ||
            transaction.spanRecorder.spans.filter(
              span =>
                span.spanId !== transaction.spanId &&
                span.op !== 'ui.load.initial_display' &&
                span.op !== 'navigation.processing',
            ).length === 0)
        ) {
          logger.log(
            '[ReactNativeTracing] Not sampling transaction as route has been seen before. Pass ignoreEmptyBackNavigationTransactions = false to disable this feature.',
          );
          // Route has been seen before and has no child spans.
          transaction.sampled = false;
        }
      });
    }

    return idleTransaction;
  }

  /**
   * Start app state aware idle transaction on the scope.
   */
  private _startIdleTransaction(context: TransactionContext): IdleTransaction {
    const { idleTimeoutMs, finalTimeoutMs } = this.options;
    const hub = this._getCurrentHub?.() || getCurrentHub();
    const tx = startIdleTransaction(hub, context, idleTimeoutMs, finalTimeoutMs, true);
    cancelInBackground(tx);
    return tx;
  }
}

/**
 * Returns transaction start timestamp in milliseconds.
 * If start timestamp is not available, returns 0.
 */
function getTransactionStartTimestampMs(transaction: Transaction): number {
  return (spanToJSON(transaction).start_timestamp || 0) * 1000;
}
