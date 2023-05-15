import type { RoutingInstrumentation } from '../../src/js';
import type { OnConfirmRoute, TransactionCreator } from '../../src/js/tracing/routingInstrumentation';
import type { BeforeNavigate } from '../../src/js/tracing/types';

export interface MockedRoutingInstrumentation extends RoutingInstrumentation {
  registeredListener?: TransactionCreator;
  registeredBeforeNavigate?: BeforeNavigate;
  registeredOnConfirmRoute?: OnConfirmRoute;
}

export const createMockedRoutingInstrumentation = (): MockedRoutingInstrumentation => {
  const mock: MockedRoutingInstrumentation = {
    name: 'TestRoutingInstrumentationInstance',
    onRouteWillChange: jest.fn(),
    registerRoutingInstrumentation: jest.fn(
      (listener: TransactionCreator, beforeNavigate: BeforeNavigate, onConfirmRoute: OnConfirmRoute) => {
        mock.registeredListener = listener;
        mock.registeredBeforeNavigate = beforeNavigate;
        mock.registeredOnConfirmRoute = onConfirmRoute;
      },
    ),
  };
  return mock;
};

export const mockedConfirmedRouteTransactionContext = {
  name: 'mockedRouteName',
  data: {
    route: {
      name: 'mockedRouteName',
    },
  },
};
