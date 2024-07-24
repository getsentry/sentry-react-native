import type { Hub } from '@sentry/core';
import type { Transaction, TransactionContext } from '@sentry/types';

import type { BeforeNavigate } from './types';

export type TransactionCreator = (context: TransactionContext) => Transaction | undefined;

export type OnConfirmRoute = (context: TransactionContext) => void;

export interface RoutingInstrumentationInstance {
  /**
   * Name of the routing instrumentation
   */
  readonly name: string;
  /**
   * Registers a listener that's called on every route change with a `TransactionContext`.
   *
   * Do not overwrite this unless you know what you are doing.
   *
   * @param listener A `RouteListener`
   * @param beforeNavigate BeforeNavigate
   * @param inConfirmRoute OnConfirmRoute
   */
  registerRoutingInstrumentation(
    listener: TransactionCreator,
    beforeNavigate: BeforeNavigate,
    onConfirmRoute: OnConfirmRoute,
  ): void;
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
  public static instrumentationName: string = 'base-routing-instrumentation';

  public readonly name: string = RoutingInstrumentation.instrumentationName;

  protected _getCurrentHub?: () => Hub;
  protected _beforeNavigate?: BeforeNavigate;
  protected _onConfirmRoute?: OnConfirmRoute;
  protected _tracingListener?: TransactionCreator;

  /** @inheritdoc */
  public registerRoutingInstrumentation(
    listener: TransactionCreator,
    beforeNavigate: BeforeNavigate,
    onConfirmRoute: OnConfirmRoute,
  ): void {
    this._tracingListener = listener;
    this._beforeNavigate = beforeNavigate;
    this._onConfirmRoute = onConfirmRoute;
  }

  /** @inheritdoc */
  public onRouteWillChange(context: TransactionContext): Transaction | undefined {
    const transaction = this._tracingListener?.(context);

    if (transaction) {
      this._onConfirmRoute?.(context);
    }

    return transaction;
  }
}

/**
 * Internal base routing instrumentation where `_onConfirmRoute` is not called in onRouteWillChange
 */
export class InternalRoutingInstrumentation extends RoutingInstrumentation {
  /** @inheritdoc */
  public onRouteWillChange(context: TransactionContext): Transaction | undefined {
    return this._tracingListener?.(context);
  }
}
