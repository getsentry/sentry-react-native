/* eslint-disable max-lines */
import type { Transaction as TransactionType, TransactionContext } from '@sentry/types';
import { logger } from '@sentry/utils';

import { RN_GLOBAL_OBJ } from '../utils/worldwide';
import type { OnConfirmRoute, TransactionCreator } from './routingInstrumentation';
import { InternalRoutingInstrumentation } from './routingInstrumentation';
import type { BeforeNavigate, ReactNavigationTransactionContext, RouteChangeContextData } from './types';
import { customTransactionSource, defaultTransactionSource, getBlankTransactionContext } from './utils';

export interface NavigationRoute {
  name: string;
  key: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: Record<string, any>;
}

interface NavigationContainer {
  addListener: (type: string, listener: () => void) => void;
  getCurrentRoute: () => NavigationRoute;
}

interface ReactNavigationOptions {
  /**
   * How long the instrumentation will wait for the route to mount after a change has been initiated,
   * before the transaction is discarded.
   * Time is in ms.
   *
   * Default: 1000
   */
  routeChangeTimeoutMs: number;
}

const defaultOptions: ReactNavigationOptions = {
  routeChangeTimeoutMs: 1000,
};

/**
 * Instrumentation for React-Navigation V5 and above. See docs or sample app for usage.
 *
 * How this works:
 * - `_onDispatch` is called every time a dispatch happens and sets an IdleTransaction on the scope without any route context.
 * - `_onStateChange` is then called AFTER the state change happens due to a dispatch and sets the route context onto the active transaction.
 * - If `_onStateChange` isn't called within `STATE_CHANGE_TIMEOUT_DURATION` of the dispatch, then the transaction is not sampled and finished.
 */
export class ReactNavigationInstrumentation extends InternalRoutingInstrumentation {
  public static instrumentationName: string = 'react-navigation-v5';

  public readonly name: string = ReactNavigationInstrumentation.instrumentationName;

  private _navigationContainer: NavigationContainer | null = null;

  private readonly _maxRecentRouteLen: number = 200;

  private _latestRoute?: NavigationRoute;
  private _latestTransaction?: TransactionType;
  private _initialStateHandled: boolean = false;
  private _stateChangeTimeout?: number | undefined;
  private _recentRouteKeys: string[] = [];

  private _options: ReactNavigationOptions;

  public constructor(options: Partial<ReactNavigationOptions> = {}) {
    super();

    this._options = {
      ...defaultOptions,
      ...options,
    };
  }

  /**
   * Extends by calling _handleInitialState at the end.
   */
  public registerRoutingInstrumentation(
    listener: TransactionCreator,
    beforeNavigate: BeforeNavigate,
    onConfirmRoute: OnConfirmRoute,
  ): void {
    super.registerRoutingInstrumentation(listener, beforeNavigate, onConfirmRoute);

    // We create an initial state here to ensure a transaction gets created before the first route mounts.
    if (!this._initialStateHandled) {
      this._onDispatch();
      if (this._navigationContainer) {
        // Navigation container already registered, just populate with route state
        this._onStateChange();

        this._initialStateHandled = true;
      }
    }
  }

  /**
   * Pass the ref to the navigation container to register it to the instrumentation
   * @param navigationContainerRef Ref to a `NavigationContainer`
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  public registerNavigationContainer(navigationContainerRef: any): void {
    /* We prevent duplicate routing instrumentation to be initialized on fast refreshes

      Explanation: If the user triggers a fast refresh on the file that the instrumentation is
      initialized in, it will initialize a new instance and will cause undefined behavior.
     */
    if (!RN_GLOBAL_OBJ.__sentry_rn_v5_registered) {
      if ('current' in navigationContainerRef) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        this._navigationContainer = navigationContainerRef.current;
      } else {
        this._navigationContainer = navigationContainerRef;
      }

      if (this._navigationContainer) {
        this._navigationContainer.addListener(
          '__unsafe_action__', // This action is emitted on every dispatch
          this._onDispatch.bind(this),
        );
        this._navigationContainer.addListener(
          'state', // This action is emitted on every state change
          this._onStateChange.bind(this),
        );

        if (!this._initialStateHandled) {
          if (this._latestTransaction) {
            // If registerRoutingInstrumentation was called first _onDispatch has already been called
            this._onStateChange();

            this._initialStateHandled = true;
          } else {
            logger.log(
              '[ReactNavigationInstrumentation] Navigation container registered, but integration has not been setup yet.',
            );
          }
        }

        RN_GLOBAL_OBJ.__sentry_rn_v5_registered = true;
      } else {
        logger.warn('[ReactNavigationInstrumentation] Received invalid navigation container ref!');
      }
    } else {
      logger.log(
        '[ReactNavigationInstrumentation] Instrumentation already exists, but register has been called again, doing nothing.',
      );
    }
  }

  /**
   * To be called on every React-Navigation action dispatch.
   * It does not name the transaction or populate it with route information. Instead, it waits for the state to fully change
   * and gets the route information from there, @see _onStateChange
   */
  private _onDispatch(): void {
    if (this._latestTransaction) {
      logger.log(
        '[ReactNavigationInstrumentation] A transaction was detected that turned out to be a noop, discarding.',
      );
      this._discardLatestTransaction();
      this._clearStateChangeTimeout();
    }

    this._latestTransaction = this.onRouteWillChange(
      getBlankTransactionContext(ReactNavigationInstrumentation.instrumentationName),
    );

    this._stateChangeTimeout = setTimeout(
      this._discardLatestTransaction.bind(this),
      this._options.routeChangeTimeoutMs,
    );
  }

  /**
   * To be called AFTER the state has been changed to populate the transaction with the current route.
   */
  private _onStateChange(): void {
    // Use the getCurrentRoute method to be accurate.
    const previousRoute = this._latestRoute;

    if (!this._navigationContainer) {
      logger.warn(
        '[ReactNavigationInstrumentation] Missing navigation container ref. Route transactions will not be sent.',
      );

      return;
    }

    const route = this._navigationContainer.getCurrentRoute();

    if (route) {
      if (this._latestTransaction) {
        if (!previousRoute || previousRoute.key !== route.key) {
          const originalContext = this._latestTransaction.toContext() as typeof BLANK_TRANSACTION_CONTEXT;
          const routeHasBeenSeen = this._recentRouteKeys.includes(route.key);

          const data: RouteChangeContextData = {
            ...originalContext.data,
            route: {
              name: route.name,
              key: route.key,
              params: route.params ?? {},
              hasBeenSeen: routeHasBeenSeen,
            },
            previousRoute: previousRoute
              ? {
                  name: previousRoute.name,
                  key: previousRoute.key,
                  params: previousRoute.params ?? {},
                }
              : null,
          };

          const updatedContext: ReactNavigationTransactionContext = {
            ...originalContext,
            name: route.name,
            tags: {
              ...originalContext.tags,
              'routing.route.name': route.name,
            },
            data,
          };

          const finalContext = this._prepareFinalContext(updatedContext);
          this._latestTransaction.updateWithContext(finalContext);

          const isCustomName = updatedContext.name !== finalContext.name;
          this._latestTransaction.setName(
            finalContext.name,
            isCustomName ? customTransactionSource : defaultTransactionSource,
          );

          this._onConfirmRoute?.(finalContext);
        }

        this._pushRecentRouteKey(route.key);
        this._latestRoute = route;

        // Clear the latest transaction as it has been handled.
        this._latestTransaction = undefined;
      }
    }
  }

  /** Creates final transaction context before confirmation */
  private _prepareFinalContext(updatedContext: TransactionContext): TransactionContext {
    let finalContext = this._beforeNavigate?.({ ...updatedContext });

    // This block is to catch users not returning a transaction context
    if (!finalContext) {
      logger.error(
        `[ReactNavigationInstrumentation] beforeNavigate returned ${finalContext}, return context.sampled = false to not send transaction.`,
      );

      finalContext = {
        ...updatedContext,
        sampled: false,
      };
    }

    // Note: finalContext.sampled will be false at this point only if the user sets it to be so in beforeNavigate.
    if (finalContext.sampled === false) {
      logger.log(
        `[ReactNavigationInstrumentation] Will not send transaction "${finalContext.name}" due to beforeNavigate.`,
      );
    } else {
      // Clear the timeout so the transaction does not get cancelled.
      this._clearStateChangeTimeout();
    }

    return finalContext;
  }

  /** Pushes a recent route key, and removes earlier routes when there is greater than the max length */
  private _pushRecentRouteKey = (key: string): void => {
    this._recentRouteKeys.push(key);

    if (this._recentRouteKeys.length > this._maxRecentRouteLen) {
      this._recentRouteKeys = this._recentRouteKeys.slice(this._recentRouteKeys.length - this._maxRecentRouteLen);
    }
  };

  /** Cancels the latest transaction so it does not get sent to Sentry. */
  private _discardLatestTransaction(): void {
    if (this._latestTransaction) {
      this._latestTransaction.sampled = false;
      this._latestTransaction.finish();
      this._latestTransaction = undefined;
    }
  }

  /**
   *
   */
  private _clearStateChangeTimeout(): void {
    if (typeof this._stateChangeTimeout !== 'undefined') {
      clearTimeout(this._stateChangeTimeout);
      this._stateChangeTimeout = undefined;
    }
  }
}

/**
 * Backwards compatibility alias for ReactNavigationInstrumentation
 * @deprecated Use ReactNavigationInstrumentation
 */
export const ReactNavigationV5Instrumentation = ReactNavigationInstrumentation;

export const BLANK_TRANSACTION_CONTEXT = {
  name: 'Route Change',
  op: 'navigation',
  tags: {
    'routing.instrumentation': ReactNavigationInstrumentation.instrumentationName,
  },
  data: {},
};
