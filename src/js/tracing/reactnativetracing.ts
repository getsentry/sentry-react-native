import {
  defaultRequestInstrumentationOptions,
  registerRequestInstrumentation,
  RequestInstrumentationOptions,
  startIdleTransaction,
} from "@sentry/tracing";
import {
  EventProcessor,
  Hub,
  Integration,
  Transaction as TransactionType,
  TransactionContext,
} from "@sentry/types";
import { logger } from "@sentry/utils";

import { RoutingInstrumentation } from "../tracing/router";
import { adjustTransactionDuration, secToMs } from "./utils";

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
  routingInstrumentation?: RoutingInstrumentation;
}

const defaultReactNativeTracingOptions: ReactNativeTracingOptions = {
  ...defaultRequestInstrumentationOptions,
  idleTimeout: 1000,
  maxTransactionDuration: 600,
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

  constructor(options: Partial<ReactNativeTracingOptions> = {}) {
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

    routingInstrumentation?.registerListener(
      this._onRouteWillChange.bind(this)
    );

    if (!routingInstrumentation) {
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

  /** To be called when the route changes, but BEFORE the components of the new route mount. */
  private _onRouteWillChange(context: TransactionContext): void {
    // TODO: Consider more features on route change, one example is setting a tag of what route the user is on
    this._createRouteTransaction(context);
  }

  /** Create routing idle transaction. */
  private _createRouteTransaction(
    context: TransactionContext
  ): TransactionType | undefined {
    if (!this._getCurrentHub) {
      logger.warn(
        `[ReactNativeTracing] Did not create ${context.op} transaction because _getCurrentHub is invalid.`
      );
      return undefined;
    }

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const { idleTimeout, maxTransactionDuration } = this.options;

    if (context.sampled === false) {
      logger.log(
        `[ReactNativeTracing] Will not send ${context.op} transaction because of beforeNavigate.`
      );
    }

    const hub = this._getCurrentHub();
    const idleTransaction = startIdleTransaction(
      hub as any,
      context,
      idleTimeout,
      true
    );
    logger.log(
      `[ReactNativeTracing] Starting ${context.op} transaction on scope`
    );
    idleTransaction.registerBeforeFinishCallback(
      (transaction, endTimestamp) => {
        // this._metrics.addPerformanceEntries(transaction);
        adjustTransactionDuration(
          secToMs(maxTransactionDuration),
          transaction,
          endTimestamp
        );
      }
    );

    return idleTransaction as TransactionType;
  }
}
