/* eslint-disable max-lines */
import { Hub } from "@sentry/hub";
import {
  defaultRequestInstrumentationOptions,
  IdleTransaction,
  registerRequestInstrumentation,
  RequestInstrumentationOptions,
  startIdleTransaction,
} from "@sentry/tracing";
import {
  EventProcessor,
  Integration,
  Transaction as TransactionType,
  TransactionContext,
} from "@sentry/types";
import { logger } from "@sentry/utils";

import { NativeAppStartResponse } from "../definitions";
import { StallTracking } from "../integrations";
import { RoutingInstrumentationInstance } from "../tracing/routingInstrumentation";
import { NATIVE } from "../wrapper";
import { adjustTransactionDuration, getTimeOriginMilliseconds } from "./utils";

export type BeforeNavigate = (
  context: TransactionContext
) => TransactionContext;

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
}

const defaultReactNativeTracingOptions: ReactNativeTracingOptions = {
  ...defaultRequestInstrumentationOptions,
  idleTimeout: 1000,
  maxTransactionDuration: 600,
  ignoreEmptyBackNavigationTransactions: true,
  beforeNavigate: (context) => context,
  enableAppStartTracking: true,
};

/**
 * Tracing integration for React Native.
 */
export class ReactNativeTracing implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = "ReactNativeTracing";
  /**
   * @inheritDoc
   */
  public name: string = ReactNativeTracing.id;

  /** ReactNativeTracing options */
  public options: ReactNativeTracingOptions;

  private _getCurrentHub?: () => Hub;
  private _awaitingAppStartData?: NativeAppStartResponse;

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
    } = this.options;

    this._getCurrentHub = getCurrentHub;

    void this.instrumentAppStart();

    if (routingInstrumentation) {
      routingInstrumentation.registerRoutingInstrumentation(
        this._onRouteWillChange.bind(this),
        this.options.beforeNavigate
      );
    } else {
      logger.log(
        `[ReactNativeTracing] Not instrumenting route changes as routingInstrumentation has not been set.`
      );
    }

    registerRequestInstrumentation({
      traceFetch,
      traceXHR,
      tracingOrigins,
      shouldCreateSpanForRequest,
    });
  }

  /**
   * Instruments the app start measurements on the first route transaction.
   * Starts a route transaction if there isn't routing instrumentation.
   */
  public async instrumentAppStart(): Promise<void> {
    if (!this.options.enableAppStartTracking) {
      return;
    }

    const appStart = await NATIVE.fetchNativeAppStart();

    if (appStart.didFetchAppStart) {
      return;
    }

    if (this.options.routingInstrumentation) {
      this._awaitingAppStartData = appStart;
    } else {
      const appStartTimeSeconds = appStart.appStartTime / 1000;

      const idleTransaction = this._createRouteTransaction({
        name: "App Start",
        op: "ui.load",
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
    const appStartTimeSeconds = appStart.appStartTime / 1000;
    const timeOriginSeconds = getTimeOriginMilliseconds() / 1000;

    transaction.startChild({
      description: appStart.isColdStart ? "Cold App Start" : "Warm App Start",
      op: appStart.isColdStart ? "app.start.cold" : "app.start.warm",
      startTimestamp: appStartTimeSeconds,
      endTimestamp: timeOriginSeconds,
    });

    const appStartDurationMilliseconds =
      getTimeOriginMilliseconds() - appStart.appStartTime;

    transaction.setMeasurements(
      appStart.isColdStart
        ? {
            app_start_cold: {
              value: appStartDurationMilliseconds,
            },
          }
        : {
            app_start_warm: {
              value: appStartDurationMilliseconds,
            },
          }
    );
  }

  /** To be called when the route changes, but BEFORE the components of the new route mount. */
  private _onRouteWillChange(
    context: TransactionContext
  ): TransactionType | undefined {
    // TODO: Consider more features on route change, one example is setting a tag of what route the user is on
    return this._createRouteTransaction(context);
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
      true
    );

    logger.log(
      `[ReactNativeTracing] Starting ${context.op} transaction "${context.name}" on scope`
    );

    idleTransaction.registerBeforeFinishCallback((transaction) => {
      if (this.options.enableAppStartTracking && this._awaitingAppStartData) {
        transaction.startTimestamp =
          this._awaitingAppStartData.appStartTime / 1000;
        transaction.op = "ui.load";

        this._addAppStartData(transaction, this._awaitingAppStartData);

        this._awaitingAppStartData = undefined;
      }
    });

    const stallTracking = this._getCurrentHub().getIntegration(StallTracking);

    if (stallTracking) {
      const stallTrackingFinish = stallTracking.registerTransactionStart(
        idleTransaction
      );

      idleTransaction.registerBeforeFinishCallback(
        (transaction, endTimestamp) => {
          const stallMeasurements = stallTrackingFinish(endTimestamp);

          if (stallMeasurements) {
            transaction.setMeasurements(stallMeasurements);
          }
        }
      );
    }

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
            `[ReactNativeTracing] Not sampling transaction as route has been seen before. Pass ignoreEmptyBackNavigationTransactions = false to disable this feature.`
          );
          // Route has been seen before and has no child spans.
          transaction.sampled = false;
        }
      });
    }

    return idleTransaction;
  }
}
