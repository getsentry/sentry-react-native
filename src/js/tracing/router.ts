import { TransactionContext } from "@sentry/types";

export type RouteListener = (context: TransactionContext) => void;

export interface RoutingInstrumentationType {
  registerListener(listener: RouteListener): void;
  onRouteWillChange(context: TransactionContext): void;
}

/**
 * Base Routing Instrumentation. Can be used by users to manually instrument custom routers.
 */
export class RoutingInstrumentation implements RoutingInstrumentationType {
  private _listeners: RouteListener[] = [];
  /**
   * Registers a listener to route state.
   *
   * Do not overwrite this unless you know what you are doing.
   */
  public registerListener(listener: RouteListener): void {
    this._listeners.push(listener);
  }

  /**
   * Calls all route change listeners
   */
  public onRouteWillChange(context: TransactionContext): void {
    this._listeners.forEach((listener) => listener(context));
  }
}
