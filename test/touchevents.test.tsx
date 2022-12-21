/**
 * @jest-environment jsdom
 */
import * as core from '@sentry/core';
import { SeverityLevel } from '@sentry/types';

import { TouchEventBoundary } from '../src/js/touchevents';

const addBreadcrumb = jest.spyOn(core, 'addBreadcrumb');

afterEach(() => {
  jest.resetAllMocks();
});

describe('TouchEventBoundary._onTouchStart', () => {
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

    // @ts-ignore Calling private member
    boundary._onTouchStart(event);

    expect(addBreadcrumb).not.toBeCalled();
  });

  it('label is preferred over labelName and displayName', () => {
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

    // @ts-ignore Calling private member
    boundary._onTouchStart(event);

    expect(addBreadcrumb).toBeCalledWith({
      category: defaultProps.breadcrumbCategory,
      data: {
        componentTree: ['View', 'Connect(View)', 'LABEL!'],
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

    // @ts-ignore Calling private member
    boundary._onTouchStart(event);

    expect(addBreadcrumb).toBeCalledWith({
      category: defaultProps.breadcrumbCategory,
      data: {
        componentTree: ['Styled(View2)', 'Styled(View)'],
      },
      level: 'info' as SeverityLevel,
      message: 'Touch event within element: Styled(View2)',
      type: defaultProps.breadcrumbType,
    });
  });

  it('maxComponentTreeSize', () => {
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

    // @ts-ignore Calling private member
    boundary._onTouchStart(event);

    expect(addBreadcrumb).toBeCalledWith({
      category: defaultProps.breadcrumbCategory,
      data: {
        componentTree: ['Connect(View)', 'Styled(View)'],
      },
      level: 'info' as SeverityLevel,
      message: 'Touch event within element: Connect(View)',
      type: defaultProps.breadcrumbType,
    });
  });
});
