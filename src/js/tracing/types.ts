export interface ReactNavigationRoute {
  name: string;
  key: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: Record<string, any>;
}

export interface ReactNavigationCurrentRoute extends ReactNavigationRoute {
  hasBeenSeen: boolean;
}

export type RouteChangeContextData = {
  previousRoute?: {
    [key: string]: unknown;
    name: string;
  } | null;
  route: {
    [key: string]: unknown;
    name: string;
    hasBeenSeen: boolean;
  };
};

export interface ReactNavigationTransactionContext {
  data: RouteChangeContextData;
}

export type BeforeNavigate = (context: ReactNavigationTransactionContext) => ReactNavigationTransactionContext;
