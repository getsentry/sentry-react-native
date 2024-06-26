/**
 * @jest-environment jsdom
 */
import * as core from '@sentry/core';
import type { SeverityLevel } from '@sentry/types';

import { TouchEventBoundary } from '../src/js/touchevents';
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

    expect(addIntegration).toBeCalledWith(expect.objectContaining({ name: 'TouchEventBoundary' }));
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

    expect(addBreadcrumb).not.toBeCalled();
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

    expect(addBreadcrumb).toBeCalledWith({
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

    expect(addBreadcrumb).toBeCalledWith({
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

    expect(addBreadcrumb).toBeCalledWith({
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

    expect(addBreadcrumb).toBeCalledWith({
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

    expect(addBreadcrumb).toBeCalledWith({
      category: defaultProps.breadcrumbCategory,
      data: {
        path: [{ name: 'Text' }],
      },
      level: 'info' as SeverityLevel,
      message: 'Touch event within element: Text',
      type: defaultProps.breadcrumbType,
    });
  });
});
