import { render } from '@testing-library/react-native';
import * as React from 'react';

import { wrap } from '../src/js/sdk';

jest.mock('../src/js/touchevents', () => ({
  TouchEventBoundary: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { testID: 'touch-boundaryID' }, children),
}));

jest.mock('../src/js/tracing', () => ({
  ReactNativeProfiler: jest.fn(({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { testID: 'profilerID' }, children),
  ),
}));

jest.mock('../src/js/feedback/FeedbackWidgetManager', () => ({
  FeedbackWidgetProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { testID: 'feedback-widgetID' }, children),
}));

import type { ReactNativeWrapperOptions } from 'src/js/options';

import { ReactNativeProfiler } from '../src/js/tracing';

describe('wrap', () => {
  const DummyComponent: React.FC<{ value?: string }> = ({ value }) => React.createElement('div', null, value);

  it('wraps components with Sentry wrappers', () => {
    const Wrapped = wrap(DummyComponent);
    const element = React.createElement(Wrapped, { value: 'wrapped' });
    const renderResult = render(element);

    const { getByTestId } = renderResult;
    expect(getByTestId('touch-boundaryID')).toBeDefined();
    expect(getByTestId('profilerID')).toBeTruthy();
    expect(getByTestId('feedback-widgetID')).toBeTruthy();
  });

  describe('ReactNativeProfiler', () => {
    it('uses given options when set', () => {
      const options: ReactNativeWrapperOptions = {
        profilerProps: { name: 'custom Name' },
      };
      const Wrapped = wrap(DummyComponent, options);
      const element = React.createElement(Wrapped, { value: 'wrapped' });
      render(element);

      expect(ReactNativeProfiler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Root',
        }),
        expect.anything(),
      );
    });

    it('updateProps not set when not defined', () => {
      const Wrapped = wrap(DummyComponent);
      const element = React.createElement(Wrapped, { value: 'wrapped' });
      render(element);

      expect(ReactNativeProfiler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Root',
        }),
        expect.anything(),
      );
    });
  });
});
