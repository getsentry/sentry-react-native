import { configureStore, createSlice } from '@reduxjs/toolkit';
import * as Sentry from '@sentry/react';

const sentryReduxEnhancer = Sentry.createReduxEnhancer({
  // Optionally pass options here
});

const counterSlice = createSlice({
  name: 'counter',
  initialState: {
    value: 0,
  },
  reducers: {
    increment: state => {
      state.value += 1;
    },
    reset: state => {
      state.value = 0;
    },
  },
});

const store = configureStore({
  reducer: {
    counter: counterSlice.reducer,
  },
  enhancers: getDefaultEnhancers => {
    return getDefaultEnhancers().concat(sentryReduxEnhancer);
  },
});

export const { increment, reset } = counterSlice.actions;

export type IRootState = ReturnType<typeof store.getState>;

export default store;
