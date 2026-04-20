/**
 * @jest-environment jsdom
 */
import type { SeverityLevel } from '@sentry/core';

import * as core from '@sentry/core';

import { TouchEventBoundary } from '../src/js/touchevents';
import * as userInteractionModule from '../src/js/tracing/integrations/userInteraction';
import { getDefaultTestClientOptions, TestClient } from './mocks/client';

describe('TouchEventBoundary._onTouchStart', () => {
  let addBreadcrumb: jest.SpyInstance;
  let addIntegration: jest.SpyInstance;
  let client: TestClient;

  beforeEach(() => {
    jest.resetAllMocks();
    addBreadcrumb = jest.spyOn(core, 'addBreadcrumb');

    client = new TestClient(getDefaultTestClientOptions());
    core.setCurrentClient(client);
    client.init();
  });

  it('register itself as integration', () => {
    addIntegration = jest.spyOn(client, 'addIntegration');
    const { defaultProps } = TouchEventBoundary;
    const boundary = new TouchEventBoundary(defaultProps);

    boundary.componentDidMount();

    expect(addIntegration).toHaveBeenCalledWith(expect.objectContaining({ name: 'TouchEventBoundary' }));
  });

  it('tree without displayName or label is not logged', () => {
    const { defaultProps } = TouchEventBoundary;
    const boundary = new TouchEventBoundary(defaultProps);

    const event = {
      _targetInst: {
        elementType: {
          name: 'View',
        },
        return: {
          elementType: {
            name: 'Text',
          },
          return: {
            elementType: {
              name: 'CoolComponent',
            },
            return: {
              elementType: {
                name: 'Screen',
              },
            },
          },
        },
      },
    };

    // @ts-expect-error Calling private member
    boundary._onTouchStart(event);

    expect(addBreadcrumb).not.toHaveBeenCalled();
  });

  it('sentry-label is preferred over labelName and displayName', () => {
    const { defaultProps } = TouchEventBoundary;
    const boundary = new TouchEventBoundary({
      ...defaultProps,
      labelName: 'custom-sentry-label-name',
    });

    const event = {
      _targetInst: {
        elementType: {
          displayName: 'View',
        },
        return: {
          elementType: {
            name: 'Text',
          },
          return: {
            elementType: {
              displayName: 'Connect(View)',
            },
            return: {
              memoizedProps: {
                'sentry-label': 'LABEL!',
                'custom-sentry-label-name': 'access!',
              },
            },
          },
        },
      },
    };

    // @ts-expect-error Calling private member
    boundary._onTouchStart(event);

    expect(addBreadcrumb).toHaveBeenCalledWith({
      category: defaultProps.breadcrumbCategory,
      data: {
        path: [{ name: 'View' }, { name: 'Connect(View)' }, { label: 'LABEL!' }],
      },
      level: 'info' as SeverityLevel,
      message: 'Touch event within element: LABEL!',
      type: defaultProps.breadcrumbType,
    });
  });

  it('ignoreNames', () => {
    const { defaultProps } = TouchEventBoundary;
    const boundary = new TouchEventBoundary({
      ...defaultProps,
      labelName: 'custom-sentry-label-name',
      ignoreNames: ['View', 'Ignore', /^Connect\(/, new RegExp('^Happy\\(')],
    });

    const event = {
      _targetInst: {
        elementType: {
          name: 'View',
        },
        return: {
          elementType: {
            name: 'Text',
          },
          return: {
            elementType: {
              displayName: 'Connect(View)',
            },
            return: {
              memoizedProps: {
                'sentry-label': 'Ignore',
                'custom-sentry-label-name': 'Ignore',
              },
              elementType: {
                displayName: 'Styled(View2)',
              },
              return: {
                elementType: {
                  displayName: 'Styled(View)',
                },
                return: {
                  elementType: {
                    displayName: 'Happy(View)',
                  },
                },
              },
            },
          },
        },
      },
    };

    // @ts-expect-error Calling private member
    boundary._onTouchStart(event);

    expect(addBreadcrumb).toHaveBeenCalledWith({
      category: defaultProps.breadcrumbCategory,
      data: {
        path: [{ name: 'Styled(View)' }],
      },
      level: 'info' as SeverityLevel,
      message: 'Touch event within element: Styled(View)',
      type: defaultProps.breadcrumbType,
    });
  });

  it('maxpathSize', () => {
    const { defaultProps } = TouchEventBoundary;
    const boundary = new TouchEventBoundary({
      ...defaultProps,
      maxComponentTreeSize: 2,
      labelName: 'custom-sentry-label-name',
    });

    const event = {
      _targetInst: {
        elementType: {
          name: 'View',
        },
        return: {
          elementType: {
            name: 'Text',
          },
          return: {
            memoizedProps: {
              'custom-sentry-label-name': 'Connect(View)',
            },
            return: {
              elementType: {
                displayName: 'Styled(View)',
              },
              return: {
                elementType: {
                  displayName: 'Happy(View)',
                },
              },
            },
          },
        },
      },
    };

    // @ts-expect-error Calling private member
    boundary._onTouchStart(event);

    expect(addBreadcrumb).toHaveBeenCalledWith({
      category: defaultProps.breadcrumbCategory,
      data: {
        path: [{ label: 'Connect(View)' }, { name: 'Styled(View)' }],
      },
      level: 'info' as SeverityLevel,
      message: 'Touch event within element: Connect(View)',
      type: defaultProps.breadcrumbType,
    });
  });

  // see https://docs.sentry.io/platforms/javascript/guides/react/features/component-names/
  it('uses custom names provided by babel plugin', () => {
    const { defaultProps } = TouchEventBoundary;
    const boundary = new TouchEventBoundary(defaultProps);

    const event = {
      _targetInst: {
        elementType: {
          displayName: 'View',
        },
        memoizedProps: {
          'data-sentry-component': 'Screen',
          'data-sentry-element': 'AnimatedNativeScreen',
          'data-sentry-source-file': 'screen.tsx',
        },
        return: {
          elementType: {
            displayName: 'Text',
          },
          return: {
            memoizedProps: {
              'custom-sentry-label-name': 'Connect(View)',
              'data-sentry-component': 'MyView',
              'data-sentry-element': 'unknown', // should be ignored
              'data-sentry-source-file': 'myview.tsx',
            },
            return: {
              elementType: {
                displayName: 'Styled(View)',
              },
              return: {
                memoizedProps: {
                  'data-sentry-component': 'Happy',
                  'data-sentry-element': 'View',
                  'data-sentry-source-file': 'happyview.js',
                },
              },
            },
          },
        },
      },
    };

    // @ts-expect-error Calling private member
    boundary._onTouchStart(event);

    expect(addBreadcrumb).toHaveBeenCalledWith({
      category: defaultProps.breadcrumbCategory,
      data: {
        path: [
          { element: 'AnimatedNativeScreen', file: 'screen.tsx', name: 'Screen' },
          { name: 'Text' },
          { file: 'myview.tsx', name: 'MyView' },
          { name: 'Styled(View)' },
          { element: 'View', file: 'happyview.js', name: 'Happy' },
        ],
      },
      level: 'info' as SeverityLevel,
      message: 'Touch event within element: Screen (screen.tsx)',
      type: defaultProps.breadcrumbType,
    });
  });

  it('deduplicates', () => {
    const { defaultProps } = TouchEventBoundary;
    const boundary = new TouchEventBoundary(defaultProps);

    const event = {
      _targetInst: {
        elementType: {
          displayName: 'Text',
        },
        return: {
          elementType: {
            displayName: 'Text',
          },
        },
      },
    };

    // @ts-expect-error Calling private member
    boundary._onTouchStart(event);

    expect(addBreadcrumb).toHaveBeenCalledWith({
      category: defaultProps.breadcrumbCategory,
      data: {
        path: [{ name: 'Text' }],
      },
      level: 'info' as SeverityLevel,
      message: 'Touch event within element: Text',
      type: defaultProps.breadcrumbType,
    });
  });

  describe('rage tap detection', () => {
    beforeEach(() => {
      jest.spyOn(Date, 'now').mockReturnValue(1000);
    });

    it('emits ui.multiClick breadcrumb after 3 taps on same target', () => {
      const { defaultProps } = TouchEventBoundary;
      const boundary = new TouchEventBoundary(defaultProps);

      const event = {
        _targetInst: {
          elementType: { displayName: 'Button' },
          memoizedProps: { 'sentry-label': 'submit' },
        },
      };

      // @ts-expect-error Calling private member
      boundary._onTouchStart(event);
      // @ts-expect-error Calling private member
      boundary._onTouchStart(event);
      // @ts-expect-error Calling private member
      boundary._onTouchStart(event);

      // 3 touch breadcrumbs + 1 multiClick breadcrumb
      expect(addBreadcrumb).toHaveBeenCalledTimes(4);
      expect(addBreadcrumb).toHaveBeenLastCalledWith(
        expect.objectContaining({
          category: 'ui.multiClick',
          level: 'warning',
          type: 'default',
          data: expect.objectContaining({
            clickCount: 3,
            metric: true,
          }),
        }),
      );
    });

    it('does not emit frustration breadcrumb when disabled via prop', () => {
      const { defaultProps } = TouchEventBoundary;
      const boundary = new TouchEventBoundary({
        ...defaultProps,
        enableRageTapDetection: false,
      });

      const event = {
        _targetInst: {
          elementType: { displayName: 'Button' },
          memoizedProps: { 'sentry-label': 'submit' },
        },
      };

      // @ts-expect-error Calling private member
      boundary._onTouchStart(event);
      // @ts-expect-error Calling private member
      boundary._onTouchStart(event);
      // @ts-expect-error Calling private member
      boundary._onTouchStart(event);

      // Only touch breadcrumbs
      expect(addBreadcrumb).toHaveBeenCalledTimes(3);
      for (const call of addBreadcrumb.mock.calls) {
        expect(call[0].category).toBe('touch');
      }
    });

    it('respects custom threshold and time window props', () => {
      const { defaultProps } = TouchEventBoundary;
      const boundary = new TouchEventBoundary({
        ...defaultProps,
        rageTapThreshold: 5,
        rageTapTimeWindow: 2000,
      });

      const event = {
        _targetInst: {
          elementType: { displayName: 'Button' },
          memoizedProps: { 'sentry-label': 'submit' },
        },
      };

      // 3 taps should not trigger with threshold=5
      for (let i = 0; i < 3; i++) {
        // @ts-expect-error Calling private member
        boundary._onTouchStart(event);
      }
      expect(addBreadcrumb).toHaveBeenCalledTimes(3);
      for (const call of addBreadcrumb.mock.calls) {
        expect(call[0].category).toBe('touch');
      }

      // 2 more taps (total 5) should trigger
      // @ts-expect-error Calling private member
      boundary._onTouchStart(event);
      // @ts-expect-error Calling private member
      boundary._onTouchStart(event);

      expect(addBreadcrumb).toHaveBeenCalledTimes(6); // 5 touch + 1 multiClick
      expect(addBreadcrumb).toHaveBeenLastCalledWith(
        expect.objectContaining({
          category: 'ui.multiClick',
          data: expect.objectContaining({ clickCount: 5 }),
        }),
      );
    });

    it('does not trigger when taps are outside the time window', () => {
      const { defaultProps } = TouchEventBoundary;
      const boundary = new TouchEventBoundary(defaultProps);
      const nowMock = jest.spyOn(Date, 'now');

      const event = {
        _targetInst: {
          elementType: { displayName: 'Button' },
          memoizedProps: { 'sentry-label': 'submit' },
        },
      };

      nowMock.mockReturnValue(1000);
      // @ts-expect-error Calling private member
      boundary._onTouchStart(event);

      nowMock.mockReturnValue(1500);
      // @ts-expect-error Calling private member
      boundary._onTouchStart(event);

      // Third tap beyond 1000ms default window
      nowMock.mockReturnValue(2500);
      // @ts-expect-error Calling private member
      boundary._onTouchStart(event);

      // Only touch breadcrumbs, no multiClick
      expect(addBreadcrumb).toHaveBeenCalledTimes(3);
      for (const call of addBreadcrumb.mock.calls) {
        expect(call[0].category).toBe('touch');
      }
    });
  });

  describe('sentry-span-attributes', () => {
    it('sets custom attributes from prop on user interaction span', () => {
      const { defaultProps } = TouchEventBoundary;
      const boundary = new TouchEventBoundary(defaultProps);

      const mockSpan = {
        setAttribute: jest.fn(),
        setAttributes: jest.fn(),
      };
      jest.spyOn(userInteractionModule, 'startUserInteractionSpan').mockReturnValue(mockSpan as any);

      const event = {
        _targetInst: {
          elementType: { displayName: 'Button' },
          memoizedProps: {
            'sentry-label': 'checkout',
            'sentry-span-attributes': {
              'user.subscription': 'premium',
              'cart.items': '3',
              'feature.enabled': true,
            },
          },
        },
      };

      // @ts-expect-error Calling private member
      boundary._onTouchStart(event);

      expect(mockSpan.setAttributes).toHaveBeenCalledWith({
        'user.subscription': 'premium',
        'cart.items': '3',
        'feature.enabled': true,
      });
    });

    it('handles multiple attribute types (string, number, boolean)', () => {
      const { defaultProps } = TouchEventBoundary;
      const boundary = new TouchEventBoundary(defaultProps);

      const mockSpan = {
        setAttribute: jest.fn(),
        setAttributes: jest.fn(),
      };
      jest.spyOn(userInteractionModule, 'startUserInteractionSpan').mockReturnValue(mockSpan as any);

      const event = {
        _targetInst: {
          elementType: { displayName: 'Button' },
          memoizedProps: {
            'sentry-label': 'test',
            'sentry-span-attributes': {
              'string.value': 'test',
              'number.value': 42,
              'boolean.value': false,
              'array.value': ['a', 'b', 'c'],
            },
          },
        },
      };

      // @ts-expect-error Calling private member
      boundary._onTouchStart(event);

      expect(mockSpan.setAttributes).toHaveBeenCalledWith({
        'string.value': 'test',
        'number.value': 42,
        'boolean.value': false,
        'array.value': ['a', 'b', 'c'],
      });
    });

    it('handles invalid span attributes gracefully (null)', () => {
      const { defaultProps } = TouchEventBoundary;
      const boundary = new TouchEventBoundary(defaultProps);

      const mockSpan = {
        setAttribute: jest.fn(),
        setAttributes: jest.fn(),
      };
      jest.spyOn(userInteractionModule, 'startUserInteractionSpan').mockReturnValue(mockSpan as any);

      const event = {
        _targetInst: {
          elementType: { displayName: 'Button' },
          memoizedProps: {
            'sentry-label': 'test',
            'sentry-span-attributes': null,
          },
        },
      };

      // @ts-expect-error Calling private member
      boundary._onTouchStart(event);

      expect(mockSpan.setAttributes).not.toHaveBeenCalled();
    });

    it('handles invalid span attributes gracefully (array)', () => {
      const { defaultProps } = TouchEventBoundary;
      const boundary = new TouchEventBoundary(defaultProps);

      const mockSpan = {
        setAttribute: jest.fn(),
        setAttributes: jest.fn(),
      };
      jest.spyOn(userInteractionModule, 'startUserInteractionSpan').mockReturnValue(mockSpan as any);

      const event = {
        _targetInst: {
          elementType: { displayName: 'Button' },
          memoizedProps: {
            'sentry-label': 'test',
            'sentry-span-attributes': ['invalid', 'array'],
          },
        },
      };

      // @ts-expect-error Calling private member
      boundary._onTouchStart(event);

      expect(mockSpan.setAttributes).not.toHaveBeenCalled();
    });

    it('handles empty object gracefully', () => {
      const { defaultProps } = TouchEventBoundary;
      const boundary = new TouchEventBoundary(defaultProps);

      const mockSpan = {
        setAttribute: jest.fn(),
        setAttributes: jest.fn(),
      };
      jest.spyOn(userInteractionModule, 'startUserInteractionSpan').mockReturnValue(mockSpan as any);

      const event = {
        _targetInst: {
          elementType: { displayName: 'Button' },
          memoizedProps: {
            'sentry-label': 'test',
            'sentry-span-attributes': {},
          },
        },
      };

      // @ts-expect-error Calling private member
      boundary._onTouchStart(event);

      expect(mockSpan.setAttributes).not.toHaveBeenCalled();
    });

    it('works with sentry-label', () => {
      const { defaultProps } = TouchEventBoundary;
      const boundary = new TouchEventBoundary(defaultProps);

      const mockSpan = {
        setAttribute: jest.fn(),
        setAttributes: jest.fn(),
      };
      jest.spyOn(userInteractionModule, 'startUserInteractionSpan').mockReturnValue(mockSpan as any);

      const event = {
        _targetInst: {
          elementType: { displayName: 'Button' },
          memoizedProps: {
            'sentry-label': 'checkout-button',
            'sentry-span-attributes': {
              'custom.key': 'value',
            },
          },
        },
      };

      // @ts-expect-error Calling private member
      boundary._onTouchStart(event);

      expect(userInteractionModule.startUserInteractionSpan).toHaveBeenCalledWith({
        elementId: 'checkout-button',
        op: 'ui.action.touch',
      });
      expect(mockSpan.setAttributes).toHaveBeenCalledWith({
        'custom.key': 'value',
      });
    });

    it('finds attributes in component tree', () => {
      const { defaultProps } = TouchEventBoundary;
      const boundary = new TouchEventBoundary(defaultProps);

      const mockSpan = {
        setAttribute: jest.fn(),
        setAttributes: jest.fn(),
      };
      jest.spyOn(userInteractionModule, 'startUserInteractionSpan').mockReturnValue(mockSpan as any);

      const event = {
        _targetInst: {
          elementType: { displayName: 'Text' },
          return: {
            elementType: { displayName: 'Button' },
            memoizedProps: {
              'sentry-label': 'parent-button',
              'sentry-span-attributes': {
                'found.in': 'parent',
              },
            },
          },
        },
      };

      // @ts-expect-error Calling private member
      boundary._onTouchStart(event);

      expect(mockSpan.setAttributes).toHaveBeenCalledWith({
        'found.in': 'parent',
      });
    });

    it('does not call setAttributes when no span is created', () => {
      const { defaultProps } = TouchEventBoundary;
      const boundary = new TouchEventBoundary(defaultProps);

      jest.spyOn(userInteractionModule, 'startUserInteractionSpan').mockReturnValue(undefined);

      const event = {
        _targetInst: {
          elementType: { displayName: 'Button' },
          memoizedProps: {
            'sentry-label': 'test',
            'sentry-span-attributes': {
              'custom.key': 'value',
            },
          },
        },
      };

      // @ts-expect-error Calling private member
      expect(() => boundary._onTouchStart(event)).not.toThrow();
    });
  });
});
