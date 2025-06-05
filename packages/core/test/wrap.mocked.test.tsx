// We can't test wrap with mock and non mocked components, otherwise it will break the RN testing library.
import { render } from '@testing-library/react-native';
import * as React from 'react';
import type { ReactNativeWrapperOptions } from 'src/js/options';

jest.doMock('../src/js/touchevents', () => {
  return {
        TouchEventBoundary: ({ children }: { children: React.ReactNode }) => (
          // eslint-disable-next-line react/no-unknown-property
          <div testID="touch-boundaryID">{children}</div>
        ),
      }
});

jest.doMock('../src/js/tracing', () => {
  return {
        ReactNativeProfiler: jest.fn(({ children }: { children: React.ReactNode }) => (
          // eslint-disable-next-line react/no-unknown-property
          <div testID="profilerID">{children}</div>
        )),
      }
});

jest.doMock('../src/js/feedback/FeedbackWidgetProvider', () => {
  return {
    FeedbackWidgetProvider: ({ children }: { children: React.ReactNode }) => (
      // eslint-disable-next-line react/no-unknown-property
      <div testID="feedback-widgetID">{children}</div>
    ),
  };
});

import { wrap } from '../src/js/sdk';
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
      });

      it('ignore updateProps when set', () => {
        const { wrap } = jest.requireActual('../src/js/sdk');

        const Wrapped = wrap(DummyComponent, { updateProps: ['prop'] });
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
