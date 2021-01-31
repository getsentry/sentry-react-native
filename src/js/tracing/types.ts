import { TransactionContext } from "@sentry/types";

export interface ReactNavigationRoute {
  name: string;
  key: string;
  params: Record<string, any>;
}

export interface ReactNavigationCurrentRoute extends ReactNavigationRoute {
  hasBeenSeen: boolean;
}

export interface ReactNavigationTransactionContext extends TransactionContext {
  tags: {
    "routing.instrumentation": string;
    "routing.route.name": string;
  };
  data: {
    route: ReactNavigationCurrentRoute;
    previousRoute: ReactNavigationRoute | null;
  };
}
