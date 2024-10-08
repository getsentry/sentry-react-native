import { createStore, Reducer, Action } from 'redux';
import * as Sentry from '@sentry/react';

export interface CounterIncrementAction extends Action<'COUNTER_INCREMENT'> {}
export interface CounterResetAction extends Action<'COUNTER_RESET'> {}

export type CounterAction = CounterIncrementAction | CounterResetAction;

export interface CounterState {
  counter: number;
}

const initialState = {
  counter: 0,
};

const reducer: Reducer<CounterState, CounterAction> = (
  state = initialState,
  action,
) => {
  switch (action.type) {
    case 'COUNTER_INCREMENT':
      return {
        ...state,
        counter: state.counter + 1,
      };
    case 'COUNTER_RESET':
      return {
        ...state,
        counter: 0,
      };
    default:
      return state;
  }
};

/*
  Example of how to use the Sentry redux enhancer packaged with @sentry/react:
*/

const sentryEnhancer = Sentry.createReduxEnhancer();

const store = createStore(reducer, sentryEnhancer);

export { store };
