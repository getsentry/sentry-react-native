import { Hub } from "@sentry/hub";
import { Transaction, TransactionContext } from "@sentry/types";

export type TransactionCreator = (
  context: TransactionContext
) => Transaction | undefined;

export interface RoutingInstrumentationInstance {
  /**
   * Registers a listener that's called on every route change with a `TransactionContext`.
   *
   * Do not overwrite this unless you know what you are doing.
   *
   * @param listener A `RouteListener`
   */
  registerRoutingInstrumentation(listener: TransactionCreator): void;
  /**
   * To be called when the route changes, BEFORE the new route mounts.
   * If this is called after a route mounts the child spans will not be correctly attached.
   *
   * @param context A `TransactionContext` used to initialize the transaction.
   */
  onRouteWillChange(context: TransactionContext): Transaction | undefined;
}

/**
 * Base Routing Instrumentation. Can be used by users to manually instrument custom routers.
 * Pass this to the tracing integration, and call `onRouteWillChange` every time before a route changes.
 */
export class RoutingInstrumentation implements RoutingInstrumentationInstance {
  protected _getCurrentHub?: () => Hub;

  private _tracingListener?: TransactionCreator;

  /** @inheritdoc */
  registerRoutingInstrumentation(listener: TransactionCreator): void {
    this._tracingListener = listener;
  }

  /** @inheritdoc */
  public onRouteWillChange(
    context: TransactionContext
  ): Transaction | undefined {
    return this._tracingListener?.(context);
  }
}
