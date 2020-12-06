import {
  defaultRequestInstrumentationOptions,
  IdleTransaction,
  registerRequestInstrumentation,
  RequestInstrumentationOptions,
  SpanStatus,
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

/**
 * Converts from milliseconds to seconds
 * @param time time in ms
 */
export function msToSec(time: number): number {
  return time / 1000;
}

/**
 * Converts from seconds to milliseconds
 * @param time time in seconds
 */
export function secToMs(time: number): number {
  return time * 1000;
}

/**
 *
 */
function adjustTransactionDuration(
  maxDuration: number,
  transaction: IdleTransaction,
  endTimestamp: number
): void {
  const diff = endTimestamp - transaction.startTimestamp;
  const isOutdatedTransaction =
    endTimestamp && (diff > maxDuration || diff < 0);
  if (isOutdatedTransaction) {
    transaction.setStatus(SpanStatus.DeadlineExceeded);
    transaction.setTag("maxTransactionDurationExceeded", "true");
  }
}

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

  routingInstrumentation?: RoutingInstrumentation;
}

const defaultReactNativeTracingOptions: ReactNativeTracingOptions = {
  ...defaultRequestInstrumentationOptions,
  idleTimeout: 1000,
  maxTransactionDuration: 600,
};

/**
 *
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
  // @ts-ignore TODO
  private _getCurrentHub?: () => Hub;

  constructor(options: Partial<ReactNativeTracingOptions> = {}) {
    this.options = {
      ...defaultReactNativeTracingOptions,
      ...options,
    };
  }

  /**
   *
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
