import { render } from '@testing-library/react-native';
import * as React from 'react';
import { wrap } from '../src/js/sdk';

jest.mock('../src/js/touchevents', () => ({
  __esModule: true,
  TouchEventBoundary: ({ children }: { children: React.ReactNode }) =>
    React.createElement(
  'div',
  { 'testID': 'touch-boundaryID' },
  children)
}));

jest.mock('../src/js/tracing', () => ({
  __esModule: true,
  ReactNativeProfiler: jest.fn(({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { testID: 'profilerID' }, children)),
}));

jest.mock('../src/js/feedback/FeedbackWidgetManager', () => ({
  __esModule: true,
  FeedbackWidgetProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(
    'div',
    { 'testID': 'feedback-widgetID' },
    children)
}));

import { ReactNativeProfiler } from '../src/js/tracing';
import { ReactNativeWrapperOptions } from 'src/js/options';

// Test
describe('wrap', () => {
    const DummyComponent: React.FC<{ value?: string }> = ({ value }) => React.createElement('div', null, value);

  it('wraps components with Sentry wrappers', () => {
    const Wrapped = wrap(DummyComponent);
    const element = React.createElement(Wrapped, {value: 'wrapped' })
    const renderResult = render(element);

    const { getByTestId } = renderResult;
    expect(getByTestId('touch-boundaryID')).toBeDefined();
    expect(getByTestId('profilerID')).toBeTruthy();
    expect(getByTestId('feedback-widgetID')).toBeTruthy();

  });

  describe('ReactNativeProfiler', () => {

    it('uses given options when set', () => {
      const options: ReactNativeWrapperOptions = { profilerProps: { name: 'custom Name', updateProps: { update: true } } };
      const Wrapped = wrap(DummyComponent, options);
      const element = React.createElement(Wrapped, { value: 'wrapped' })
      render(element);

      expect(ReactNativeProfiler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Root',
          updateProps: { update: true },
        }),
        expect.anything()
      );
    });

    it('sets updateProps when not defined', () => {
      const Wrapped = wrap(DummyComponent);
      const element = React.createElement(Wrapped, { value: 'wrapped' })
      render(element);


      expect(ReactNativeProfiler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Root',
          updateProps: undefined,
        }),
        expect.anything()
      );
    });

    it('overwrites Root when component has a name', () => {
      const NamedDummyComponent: React.FC<{ value?: string }> = ({ value }) =>  React.createElement('div', { 'displayName': 'custom Name' }, value);
      NamedDummyComponent.displayName = 'custom Name';

      const options: ReactNativeWrapperOptions = { profilerProps: { name: 'custom Name', updateProps: { update: true } } };
      const Wrapped = wrap(NamedDummyComponent, options);
      const element = React.createElement(Wrapped, { value: 'wrapped' })
      render(element);

      expect(ReactNativeProfiler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'custom Name',
          updateProps: { update: true },
        }),
        expect.anything()
      );
    });
  });

});
