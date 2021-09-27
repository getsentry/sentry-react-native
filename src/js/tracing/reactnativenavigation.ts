import { Transaction as TransactionType } from "@sentry/types";
import { logger } from "@sentry/utils";
import { EmitterSubscription } from "react-native";

import { BeforeNavigate } from "./reactnativetracing";
import {
  RoutingInstrumentation,
  TransactionCreator,
} from "./routingInstrumentation";
import { getBlankTransactionContext } from "./utils";

interface ReactNativeNavigationOptions {
  routeChangeTimeoutMs: number;
}

const defaultOptions: ReactNativeNavigationOptions = {
  routeChangeTimeoutMs: 1000,
};

interface ComponentEvent {
  componentId: string;
}

type ComponentType =
  | "Component"
  | "TopBarTitle"
  | "TopBarBackground"
  | "TopBarButton";

export interface ComponentWillAppearEvent extends ComponentEvent {
  componentName: string;
  passProps?: Record<string | number | symbol, unknown>;
  componentType: ComponentType;
}

export interface EventSubscription {
  remove(): void;
}

export interface EventsRegistry {
  registerComponentWillAppearListener(
    callback: (event: ComponentWillAppearEvent) => void
  ): EmitterSubscription;
  registerCommandListener(
    callback: (name: string, params: unknown) => void
  ): EventSubscription;
}

export interface NavigationDelegate {
  events: () => EventsRegistry;
}

/**
 * Instrumentation for React Native Navigation. See docs or sample app for usage.
 *
 * How this works:
 * - `_onCommand` is called every time a commands happens and sets an IdleTransaction on the scope without any route context.
 * - `_onComponentWillAppear` is then called AFTER the state change happens due to a dispatch and sets the route context onto the active transaction.
 * - If `_onComponentWillAppear` isn't called within `options.routeChangeTimeoutMs` of the dispatch, then the transaction is not sampled and finished.
 */
export class ReactNativeNavigationInstrumentation extends RoutingInstrumentation {
  public static instrumentationName: string = "react-native-navigation";

  private _navigation: NavigationDelegate;
  private _options: ReactNativeNavigationOptions;

  private _prevComponentEvent: ComponentWillAppearEvent | null = null;

  private _latestTransaction?: TransactionType;
  private _recentComponentIds: string[] = [];
  private _stateChangeTimeout?: number | undefined;

  public constructor(
    /** The react native navigation `NavigationDelegate`. This is usually the import named `Navigation`. */
    navigation: NavigationDelegate,
    options: Partial<ReactNativeNavigationOptions> = {}
  ) {
    super();

    this._navigation = navigation;

    this._options = {
      ...defaultOptions,
      ...options,
    };
  }

  /**
   * Registers the event listeners for React Native Navigation
   */
  public registerRoutingInstrumentation(
    listener: TransactionCreator,
    beforeNavigate: BeforeNavigate
  ): void {
    super.registerRoutingInstrumentation(listener, beforeNavigate);

    this._navigation
      .events()
      .registerCommandListener(this._onCommand.bind(this));

    this._navigation
      .events()
      .registerComponentWillAppearListener(
        this._onComponentWillAppear.bind(this)
      );
  }

  /**
   * To be called when a navigation command is dispatched
   */
  private _onCommand(): void {
    if (this._latestTransaction) {
      this._discardLatestTransaction();
    }

    this._latestTransaction = this.onRouteWillChange(
      getBlankTransactionContext(ReactNativeNavigationInstrumentation.name)
    );

    this._stateChangeTimeout = setTimeout(
      this._discardLatestTransaction.bind(this),
      this._options.routeChangeTimeoutMs
    );
  }

  /**
   * To be called AFTER the state has been changed to populate the transaction with the current route.
   */
  private _onComponentWillAppear(event: ComponentWillAppearEvent): void {
    // If the route is a different key, this is so we ignore actions that pertain to the same screen.
    if (
      this._latestTransaction &&
      (!this._prevComponentEvent ||
        event.componentId != this._prevComponentEvent.componentId)
    ) {
      this._clearStateChangeTimeout();

      const originalContext = this._latestTransaction.toContext();
      const routeHasBeenSeen = this._recentComponentIds.includes(
        event.componentId
      );

      const updatedContext = {
        ...originalContext,
        name: event.componentName,
        tags: {
          ...originalContext.tags,
          "routing.route.name": event.componentName,
        },
        data: {
          ...originalContext.data,
          route: {
            ...event,
            hasBeenSeen: routeHasBeenSeen,
          },
          previousRoute: this._prevComponentEvent,
        },
      };

      let finalContext = this._beforeNavigate?.(updatedContext);

      // This block is to catch users not returning a transaction context
      if (!finalContext) {
        logger.error(
          `[${ReactNativeNavigationInstrumentation.name}] beforeNavigate returned ${finalContext}, return context.sampled = false to not send transaction.`
        );

        finalContext = {
          ...updatedContext,
          sampled: false,
        };
      }

      if (finalContext.sampled === false) {
        logger.log(
          `[${ReactNativeNavigationInstrumentation.name}] Will not send transaction "${finalContext.name}" due to beforeNavigate.`
        );
      }

      this._latestTransaction.updateWithContext(finalContext);

      this._prevComponentEvent = event;
    } else {
      this._discardLatestTransaction();
    }
  }

  /** Cancels the latest transaction so it does not get sent to Sentry. */
  private _discardLatestTransaction(): void {
    if (this._latestTransaction) {
      this._latestTransaction.sampled = false;
      this._latestTransaction.finish();
      this._latestTransaction = undefined;
    }

    this._clearStateChangeTimeout();
  }

  /** Cancels the latest transaction so it does not get sent to Sentry. */
  private _clearStateChangeTimeout(): void {
    if (typeof this._stateChangeTimeout !== "undefined") {
      clearTimeout(this._stateChangeTimeout);
      this._stateChangeTimeout = undefined;
    }
  }
}
