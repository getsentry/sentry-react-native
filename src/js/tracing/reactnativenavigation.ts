import { addBreadcrumb } from '@sentry/core';
import type { Span } from '@sentry/types';

import type { EmitterSubscription } from '../utils/rnlibrariesinterface';
import { isSentrySpan } from '../utils/span';
import type { OnConfirmRoute, TransactionCreator } from './routingInstrumentation';
import { InternalRoutingInstrumentation } from './routingInstrumentation';
import type { BeforeNavigate } from './types';

interface ReactNativeNavigationOptions {
  /**
   * How long the instrumentation will wait for the route to mount after a change has been initiated,
   * before the transaction is discarded.
   * Time is in ms.
   *
   * Default: 1000
   */
  routeChangeTimeoutMs: number;
  /**
   * Instrumentation will create a transaction on tab change.
   * By default only navigation commands create transactions.
   *
   * Default: true
   */
  enableTabsInstrumentation: boolean;
}

const defaultOptions: ReactNativeNavigationOptions = {
  routeChangeTimeoutMs: 1000,
  enableTabsInstrumentation: true,
};

interface ComponentEvent {
  componentId: string;
}

type ComponentType = 'Component' | 'TopBarTitle' | 'TopBarBackground' | 'TopBarButton';

export interface ComponentWillAppearEvent extends ComponentEvent {
  componentName: string;
  passProps?: Record<string | number | symbol, unknown>;
  componentType: ComponentType;
}

export interface EventSubscription {
  remove(): void;
}

export interface BottomTabPressedEvent {
  tabIndex: number;
}

export interface EventsRegistry {
  registerComponentWillAppearListener(callback: (event: ComponentWillAppearEvent) => void): EmitterSubscription;
  registerCommandListener(callback: (name: string, params: unknown) => void): EventSubscription;
  registerBottomTabPressedListener(callback: (event: BottomTabPressedEvent) => void): EmitterSubscription;
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
export class ReactNativeNavigationInstrumentation extends InternalRoutingInstrumentation {
  public static instrumentationName: string = 'react-native-navigation';

  public readonly name: string = ReactNativeNavigationInstrumentation.instrumentationName;

  private _navigation: NavigationDelegate;
  private _options: ReactNativeNavigationOptions;

  private _prevComponentEvent: ComponentWillAppearEvent | null = null;

  private _latestTransaction?: Span;
  private _recentComponentIds: string[] = [];
  private _stateChangeTimeout?: number | undefined;

  public constructor(
    /** The react native navigation `NavigationDelegate`. This is usually the import named `Navigation`. */
    navigation: unknown,
    options: Partial<ReactNativeNavigationOptions> = {},
  ) {
    super();

    this._navigation = navigation as NavigationDelegate;

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
    beforeNavigate: BeforeNavigate,
    onConfirmRoute: OnConfirmRoute,
  ): void {
    super.registerRoutingInstrumentation(listener, beforeNavigate, onConfirmRoute);

    this._navigation.events().registerCommandListener(this._onNavigation.bind(this));

    if (this._options.enableTabsInstrumentation) {
      this._navigation.events().registerBottomTabPressedListener(this._onNavigation.bind(this));
    }

    this._navigation.events().registerComponentWillAppearListener(this._onComponentWillAppear.bind(this));
  }

  /**
   * To be called when a navigation is initiated. (Command, BottomTabSelected, etc.)
   */
  private _onNavigation(): void {
    if (this._latestTransaction) {
      this._discardLatestTransaction();
    }

    this._latestTransaction = this.onRouteWillChange({ name: 'Route Change' });

    this._stateChangeTimeout = setTimeout(
      this._discardLatestTransaction.bind(this),
      this._options.routeChangeTimeoutMs,
    );
  }

  /**
   * To be called AFTER the state has been changed to populate the transaction with the current route.
   */
  private _onComponentWillAppear(event: ComponentWillAppearEvent): void {
    if (!this._latestTransaction) {
      return;
    }

    // We ignore actions that pertain to the same screen.
    const isSameComponent = this._prevComponentEvent && event.componentId === this._prevComponentEvent.componentId;
    if (isSameComponent) {
      this._discardLatestTransaction();
      return;
    }

    this._clearStateChangeTimeout();

    const routeHasBeenSeen = this._recentComponentIds.includes(event.componentId);

    this._latestTransaction.updateName(event.componentName);
    this._latestTransaction.setAttributes({
      // TODO: Should we include pass props? I don't know exactly what it contains, cant find it in the RNavigation docs
      'route.name': event.componentName,
      'route.component_type': event.componentType,
      'route.has_been_seen': routeHasBeenSeen,
      'previous_route.name': this._prevComponentEvent?.componentName,
      'previous_route.component_type': this._prevComponentEvent?.componentType,
    });

    // TODO: route name tag is replaces by event.contexts.app.view_names
    // TODO: Should we remove beforeNavigation callback or change it to be compatible with V8?

    // TODO: Remove onConfirmRoute when `context.view_names` are set directly in the navigation instrumentation
    this._onConfirmRoute?.(event.componentName);

    addBreadcrumb({
      category: 'navigation',
      type: 'navigation',
      message: `Navigation to ${event.componentName}`,
      data: {
        from: this._prevComponentEvent?.componentName,
        to: event.componentName,
      },
    });

    this._prevComponentEvent = event;
    this._latestTransaction = undefined;
  }

  /** Cancels the latest transaction so it does not get sent to Sentry. */
  private _discardLatestTransaction(): void {
    if (this._latestTransaction) {
      if (isSentrySpan(this._latestTransaction)) {
        this._latestTransaction['_sampled'] = false;
      }
      // TODO: What if it's not SentrySpan?
      this._latestTransaction.end();
      this._latestTransaction = undefined;
    }

    this._clearStateChangeTimeout();
  }

  /** Cancels the latest transaction so it does not get sent to Sentry. */
  private _clearStateChangeTimeout(): void {
    if (typeof this._stateChangeTimeout !== 'undefined') {
      clearTimeout(this._stateChangeTimeout);
      this._stateChangeTimeout = undefined;
    }
  }
}
