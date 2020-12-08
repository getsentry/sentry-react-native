import { TransactionContext } from "@sentry/types";

export type RouteListener = (context: TransactionContext) => void;

export interface RoutingInstrumentationType {
  /**
   * Registers a listener that's called on every route change with a `TransactionContext`.
   *
   * Do not overwrite this unless you know what you are doing.
   *
   * @param listener A `RouteListener`
   */
  registerListener(listener: RouteListener): void;
  /**
   * To be called when the route changes, BEFORE the new route mounts.
   * If this is called after a route mounts the child spans will not be correctly attached.
   *
   * @param context A `TransactionContext` used to initialize the transaction.
   */
  onRouteWillChange(context: TransactionContext): void;
}

/**
 * Base Routing Instrumentation. Can be used by users to manually instrument custom routers.
 * Pass this to the tracing integration, and call `onRouteWillChange` every time before a route changes.
 */
export class RoutingInstrumentation implements RoutingInstrumentationType {
  private _listeners: RouteListener[] = [];

  /** @inheritdoc */
  public registerListener(listener: RouteListener): void {
    this._listeners.push(listener);
  }

  /** @inheritdoc */
  public onRouteWillChange(context: TransactionContext): void {
    this._listeners.forEach((listener) => listener(context));
  }
}
