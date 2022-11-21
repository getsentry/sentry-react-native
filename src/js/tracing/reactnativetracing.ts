/* eslint-disable max-lines */
import { Hub } from '@sentry/core';
import {
  defaultRequestInstrumentationOptions,
  IdleTransaction,
  instrumentOutgoingRequests,
  RequestInstrumentationOptions,
  startIdleTransaction,
  Transaction,
} from '@sentry/tracing';
import {
  EventProcessor,
  Integration,
  Transaction as TransactionType,
  TransactionContext,
} from '@sentry/types';
import { logger } from '@sentry/utils';

import { NativeAppStartResponse } from '../definitions';
import { RoutingInstrumentationInstance } from '../tracing/routingInstrumentation';
import { NATIVE } from '../wrapper';
import { NativeFramesInstrumentation } from './nativeframes';
import { StallTrackingInstrumentation } from './stalltracking';
import { BeforeNavigate, RouteChangeContextData } from './types';
import {
  adjustTransactionDuration,
  getTimeOriginMilliseconds,
  isNearToNow,
} from './utils';

export interface ReactNativeTracingOptions
  extends RequestInstrumentationOptions {
  /**
   * The time to wait in ms until the transaction will be finished. The transaction will use the end timestamp of
   * the last finished span as the endtime for the transaction.
   * Time is in ms.
   *
   * Default: 1000
   */
  idleTimeout: number;

  /**
   * The maximum duration of a transaction before it will be marked as "deadline_exceeded".
   * If you never want to mark a transaction set it to 0.
   * Time is in seconds.
   *
   * Default: 600
   */
  maxTransactionDuration: number;

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
   * Track the app start time by adding measurements to the first route transaction. If there is no routing instrumentation
   * an app start transaction will be started.
   *
   * Default: true
   */
  enableAppStartTracking: boolean;

  /**
   * Track slow/frozen frames from the native layer and adds them as measurements to all transactions.
   */
  enableNativeFramesTracking: boolean;

  /**
   * Track when and how long the JS event loop stalls for. Adds stalls as measurements to all transactions.
   */
  enableStallTracking: boolean;
}

const defaultReactNativeTracingOptions: ReactNativeTracingOptions = {
  ...defaultRequestInstrumentationOptions,
  idleTimeout: 1000,
  maxTransactionDuration: 600,
  ignoreEmptyBackNavigationTransactions: true,
  beforeNavigate: (context) => context,
  enableAppStartTracking: true,
  enableNativeFramesTracking: true,
  enableStallTracking: true,
};

/**
 * Tracing integration for React Native.
 */
export class ReactNativeTracing implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'ReactNativeTracing';
   /** We filter out App starts more than 60s */
  private static _maxAppStart: number = 60000;
  /**
   * @inheritDoc
   */
  public name: string = ReactNativeTracing.id;

  /** ReactNativeTracing options */
  public options: ReactNativeTracingOptions;

  public nativeFramesInstrumentation?: NativeFramesInstrumentation;
  public stallTrackingInstrumentation?: StallTrackingInstrumentation;
  public useAppStartWithProfiler: boolean = false;

  private _getCurrentHub?: () => Hub;
  private _awaitingAppStartData?: NativeAppStartResponse;
  private _appStartFinishTimestamp?: number;

  public constructor(options: Partial<ReactNativeTracingOptions> = {}) {
    this.options = {
      ...defaultReactNativeTracingOptions,
      ...options,
    };
  }

  /**
   *  Registers routing and request instrumentation.
   */
  public setupOnce(
    // @ts-ignore TODO
    addGlobalEventProcessor: (callback: EventProcessor) => void,
    getCurrentHub: () => Hub
  ): void {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const {
      traceFetch,
      traceXHR,
      tracingOrigins,
      // @ts-ignore TODO
      shouldCreateSpanForRequest,
      routingInstrumentation,
      enableAppStartTracking,
      enableNativeFramesTracking,
      enableStallTracking,
    } = this.options;

    this._getCurrentHub = getCurrentHub;

    if (enableAppStartTracking) {
      void this._instrumentAppStart();
    }

    if (enableNativeFramesTracking) {
      NATIVE.enableNativeFramesTracking();
      this.nativeFramesInstrumentation = new NativeFramesInstrumentation(
        addGlobalEventProcessor,
        () => {
          const self = getCurrentHub().getIntegration(ReactNativeTracing);

          if (self) {
            return !!self.nativeFramesInstrumentation;
          }

          return false;
        }
      );
    } else {
      NATIVE.disableNativeFramesTracking();
    }

    if (enableStallTracking) {
      this.stallTrackingInstrumentation = new StallTrackingInstrumentation();
    }

    if (routingInstrumentation) {
      routingInstrumentation.registerRoutingInstrumentation(
        this._onRouteWillChange.bind(this),
        this.options.beforeNavigate,
        this._onConfirmRoute.bind(this)
      );
    } else {
      logger.log(
        '[ReactNativeTracing] Not instrumenting route changes as routingInstrumentation has not been set.'
      );
    }

    instrumentOutgoingRequests({
      traceFetch,
      traceXHR,
      tracingOrigins,
      shouldCreateSpanForRequest,
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
    }
  }

  /**
   * To be called on a transaction finish. Cannot have async methods.
   */
  public onTransactionFinish(
    transaction: Transaction,
    endTimestamp?: number
  ): void {
    this.nativeFramesInstrumentation?.onTransactionFinish(transaction);
    this.stallTrackingInstrumentation?.onTransactionFinish(
      transaction,
      endTimestamp
    );
  }

  /**
   * Called by the ReactNativeProfiler component on first component mount.
   */
  public onAppStartFinish(endTimestamp: number): void {
    this._appStartFinishTimestamp = endTimestamp;
  }

  /**
   * Instruments the app start measurements on the first route transaction.
   * Starts a route transaction if there isn't routing instrumentation.
   */
  private async _instrumentAppStart(): Promise<void> {
    if (!this.options.enableAppStartTracking || !NATIVE.enableNative) {
      return;
    }

    const appStart = await NATIVE.fetchNativeAppStart();

    if (!appStart || appStart.didFetchAppStart) {
      return;
    }

    if (!this.useAppStartWithProfiler) {
      this._appStartFinishTimestamp = getTimeOriginMilliseconds() / 1000;
    }

    if (this.options.routingInstrumentation) {
      this._awaitingAppStartData = appStart;
    } else {
      const appStartTimeSeconds = appStart.appStartTime / 1000;

      const idleTransaction = this._createRouteTransaction({
        name: 'App Start',
        op: 'ui.load',
        startTimestamp: appStartTimeSeconds,
      });

      if (idleTransaction) {
        this._addAppStartData(idleTransaction, appStart);
      }
    }
  }

  /**
   * Adds app start measurements and starts a child span on a transaction.
   */
  private _addAppStartData(
    transaction: IdleTransaction,
    appStart: NativeAppStartResponse
  ): void {
    if (!this._appStartFinishTimestamp) {
      logger.warn('App start was never finished.');
      return;
    }

    const appStartTimeSeconds = appStart.appStartTime / 1000;

    const appStartMode = appStart.isColdStart ? 'app.start.cold' : 'app.start.warm';
    transaction.startChild({
      description: appStart.isColdStart ? 'Cold App Start' : 'Warm App Start',
      op: appStartMode,
      startTimestamp: appStartTimeSeconds,
      endTimestamp: this._appStartFinishTimestamp,
    });

    const appStartDurationMilliseconds =
      this._appStartFinishTimestamp * 1000 - appStart.appStartTime;

    // we filter out app start more than 60s.
    // this could be due to many different reasons.
    // we've seen app starts with hours, days and even months.
    if (appStartDurationMilliseconds >= ReactNativeTracing._maxAppStart) {
      return;
    }

    transaction.setMeasurement(appStartMode, appStartDurationMilliseconds, 'millisecond');
  }

  /** To be called when the route changes, but BEFORE the components of the new route mount. */
  private _onRouteWillChange(
    context: TransactionContext
  ): TransactionType | undefined {
    return this._createRouteTransaction(context);
  }

  /**
   * Creates a breadcrumb and sets the current route as a tag.
   */
  private _onConfirmRoute(context: TransactionContext): void {
    this._getCurrentHub?.().configureScope((scope) => {
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

      scope.setTag('routing.route.name', context.name);
    });
  }

  /** Create routing idle transaction. */
  private _createRouteTransaction(
    context: TransactionContext
  ): IdleTransaction | undefined {
    if (!this._getCurrentHub) {
      logger.warn(
        `[ReactNativeTracing] Did not create ${context.op} transaction because _getCurrentHub is invalid.`
      );
      return undefined;
    }

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const { idleTimeout, maxTransactionDuration } = this.options;

    const expandedContext = {
      ...context,
      trimEnd: true,
    };

    const hub = this._getCurrentHub();
    const idleTransaction = startIdleTransaction(
      hub as Hub,
      expandedContext,
      idleTimeout,
      maxTransactionDuration * 1000, // convert seconds to milliseconds
      true
    );

    this.onTransactionStart(idleTransaction);

    logger.log(
      `[ReactNativeTracing] Starting ${context.op} transaction "${context.name}" on scope`
    );

    idleTransaction.registerBeforeFinishCallback(
      (transaction, endTimestamp) => {
        this.onTransactionFinish(transaction, endTimestamp);
      }
    );

    idleTransaction.registerBeforeFinishCallback((transaction) => {
      if (this.options.enableAppStartTracking && this._awaitingAppStartData) {
        transaction.startTimestamp =
          this._awaitingAppStartData.appStartTime / 1000;
        transaction.op = 'ui.load';

        this._addAppStartData(transaction, this._awaitingAppStartData);

        this._awaitingAppStartData = undefined;
      }
    });

    idleTransaction.registerBeforeFinishCallback(
      (transaction, endTimestamp) => {
        adjustTransactionDuration(
          maxTransactionDuration,
          transaction,
          endTimestamp
        );
      }
    );

    if (this.options.ignoreEmptyBackNavigationTransactions) {
      idleTransaction.registerBeforeFinishCallback((transaction) => {
        if (
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          transaction.data?.route?.hasBeenSeen &&
          (!transaction.spanRecorder ||
            transaction.spanRecorder.spans.filter(
              (span) => span.spanId !== transaction.spanId
            ).length === 0)
        ) {
          logger.log(
            '[ReactNativeTracing] Not sampling transaction as route has been seen before. Pass ignoreEmptyBackNavigationTransactions = false to disable this feature.'
          );
          // Route has been seen before and has no child spans.
          transaction.sampled = false;
        }
      });
    }

    return idleTransaction;
  }
}
