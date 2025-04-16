import { render } from '@testing-library/react-native';
import * as React from 'react';

import { wrap } from '../src/js/sdk';

jest.mock('../src/js/touchevents', () => ({
  TouchEventBoundary: ({ children }: { children: React.ReactNode }) => (
    // eslint-disable-next-line react/no-unknown-property
    <div testID={"touch-boundaryID"}>{children}</div>
  ),
}));

jest.mock('../src/js/tracing', () => ({
  ReactNativeProfiler: jest.fn(({ children }: { children: React.ReactNode }) => (
    // eslint-disable-next-line react/no-unknown-property
    <div testID="profilerID">{children}</div>
  )),
}));

jest.mock('../src/js/feedback/FeedbackWidgetManager', () => ({
  FeedbackWidgetProvider: ({ children }: { children: React.ReactNode }) => (
    // eslint-disable-next-line react/no-unknown-property
    <div testID="feedback-widgetID">{children}</div>
  ),
}));

import type { ReactNativeWrapperOptions } from 'src/js/options';

import { ReactNativeProfiler } from '../src/js/tracing';
describe('Sentry.wrap', () => {

  const DummyComponent: React.FC<{ value?: string }> = ({ value }) => <div>{value}</div>;

  it('should not enforce any keys on the wrapped component', () => {
    const Mock: React.FC<{ test: 23 }> = () => <></>;
    const ActualWrapped = wrap(Mock);

    expect(typeof ActualWrapped.defaultProps).toBe(typeof Mock.defaultProps);
  });

  it('wraps components with Sentry wrappers', () => {
    const Wrapped = wrap(DummyComponent);
    const renderResult = render(<Wrapped value="wrapped" />);

    expect(renderResult.toJSON()).toMatchInlineSnapshot(`
  <div
    testID="touch-boundaryID"
  >
    <div
      testID="profilerID"
    >
      <div
        testID="feedback-widgetID"
      >
        <div>
          wrapped
        </div>
      </div>
    </div>
  </div>
`);
  });

  describe('ReactNativeProfiler', () => {
    it('uses given options when set', () => {
      const options: ReactNativeWrapperOptions = {
        profilerProps: { disabled: false, includeRender: true, includeUpdates: true },
      };
      const Wrapped = wrap(DummyComponent, options);
      render(<Wrapped value="wrapped" />);

      expect(ReactNativeProfiler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Root',
          disabled: false,
          includeRender: true,
          includeUpdates: true
        }),
        expect.anything(),
      );

      expect(ReactNativeProfiler).not.toHaveBeenCalledWith(
        expect.objectContaining({
          updateProps: expect.anything(),
        })
      );

      expect(ReactNativeProfiler).not.toHaveBeenCalledWith(
        expect.objectContaining({
          removeUpdateProps: expect.anything(),
        })
      );
    });

    it('ignore updateProps when set', () => {
      // @ts-expect-error just for testing.
      const Wrapped = wrap(DummyComponent, { updateProps: [ 'prop']});
      render(<Wrapped value="wrapped" />);

      expect(ReactNativeProfiler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Root',
          updateProps: {},
        }),
        expect.anything(),
      );
    });
  });
});
