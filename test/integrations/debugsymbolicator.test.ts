import type { Event, EventHint, Hub, Integration, StackFrame } from '@sentry/types';

import { DebugSymbolicator } from '../../src/js/integrations/debugsymbolicator';
import type * as ReactNative from '../../src/js/vendor/react-native';

interface MockDebugSymbolicator extends Integration {
  _parseErrorStack: jest.Mock<Array<ReactNative.StackFrame>, [string]>;
  _symbolicateStackTrace: jest.Mock<
    Promise<ReactNative.SymbolicatedStackTrace>,
    [Array<ReactNative.StackFrame>, Record<string, unknown> | undefined]
  >;
  _getDevServer: jest.Mock<ReactNative.DevServerInfo | undefined>;
  _fetchSourceContext: jest.Mock<Promise<string | null>, [string, Array<string>, number]>;
}

describe('Debug Symbolicator Integration', () => {
  let integration: MockDebugSymbolicator;
  const mockGetCurrentHub = () =>
    ({
      getIntegration: () => integration,
    } as unknown as Hub);

  beforeEach(() => {
    integration = new DebugSymbolicator() as unknown as MockDebugSymbolicator;
    integration._parseErrorStack = jest.fn().mockReturnValue([]);
    integration._symbolicateStackTrace = jest.fn().mockReturnValue(
      Promise.resolve(<ReactNative.SymbolicatedStackTrace>{
        stack: [],
      }),
    );
    integration._getDevServer = jest.fn().mockReturnValue(<ReactNative.DevServerInfo>{
      url: 'http://localhost:8081',
    });
    integration._fetchSourceContext = jest.fn().mockReturnValue(Promise.resolve(null));
  });

  describe('parse stack', () => {
    const mockRawStack = `Error: This is mocked error stack trace
  at foo (http://localhost:8081/index.bundle?platform=ios&dev=true&minify=false:1:1)
  at bar (http://localhost:8081/index.bundle?platform=ios&dev=true&minify=false:2:2)
  at baz (native)
`;

    const mockSentryParsedFrames: Array<StackFrame> = [
      {
        function: '[native] baz',
      },
      {
        function: 'bar',
        filename: 'http://localhost:8081/index.bundle?platform=ios&dev=true&minify=false:2:2',
        lineno: 2,
        colno: 2,
      },
      {
        function: 'foo',
        filename: 'http://localhost:8081/index.bundle?platform=ios&dev=true&minify=false:1:1',
        lineno: 1,
        colno: 1,
      },
    ];

    beforeEach(() => {
      integration._parseErrorStack = jest.fn().mockReturnValue(<Array<ReactNative.StackFrame>>[
        {
          file: 'http://localhost:8081/index.bundle?platform=ios&dev=true&minify=false',
          lineNumber: 1,
          column: 1,
          methodName: 'foo',
        },
        {
          file: 'http://localhost:8081/index.bundle?platform=ios&dev=true&minify=false',
          lineNumber: 2,
          column: 2,
          methodName: 'bar',
        },
      ]);

      integration._symbolicateStackTrace = jest.fn().mockReturnValue(
        Promise.resolve(<ReactNative.SymbolicatedStackTrace>{
          stack: [
            {
              file: '/User/project/foo.js',
              lineNumber: 1,
              column: 1,
              methodName: 'foo',
            },
            {
              file: '/User/project/node_modules/bar/bar.js',
              lineNumber: 2,
              column: 2,
              methodName: 'bar',
            },
          ],
        }),
      );
    });

    it('should symbolicate errors stack trace', async () => {
      const symbolicatedEvent = await executeIntegrationFor(
        {
          exception: {
            values: [
              {
                type: 'Error',
                value: 'Error: test',
                stacktrace: {
                  frames: mockSentryParsedFrames,
                },
              },
            ],
          },
        },
        {
          originalException: {
            stack: mockRawStack,
          },
        },
      );

      expect(symbolicatedEvent).toStrictEqual(<Event>{
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Error: test',
              stacktrace: {
                frames: [
                  {
                    function: 'bar',
                    filename: '/User/project/node_modules/bar/bar.js',
                    lineno: 2,
                    colno: 2,
                    in_app: false,
                  },
                  {
                    function: 'foo',
                    filename: '/User/project/foo.js',
                    lineno: 1,
                    colno: 1,
                    in_app: true,
                  },
                ],
              },
            },
          ],
        },
      });
    });

    it('should symbolicate synthetic error stack trace for exception', async () => {
      const symbolicatedEvent = await executeIntegrationFor(
        {
          exception: {
            values: [
              {
                type: 'Error',
                value: 'Error: test',
                stacktrace: {
                  frames: [],
                },
              },
            ],
          },
        },
        {
          originalException: 'Error: test',
          syntheticException: {
            stack: mockRawStack,
          } as unknown as Error,
        },
      );

      expect(symbolicatedEvent).toStrictEqual(<Event>{
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Error: test',
              stacktrace: {
                frames: [
                  {
                    function: 'bar',
                    filename: '/User/project/node_modules/bar/bar.js',
                    lineno: 2,
                    colno: 2,
                    in_app: false,
                  },
                  {
                    function: 'foo',
                    filename: '/User/project/foo.js',
                    lineno: 1,
                    colno: 1,
                    in_app: true,
                  },
                ],
              },
            },
          ],
        },
      });
    });

    it('should symbolicate synthetic error stack trace for message', async () => {
      const symbolicatedEvent = await executeIntegrationFor(
        {
          threads: {
            values: [
              {
                stacktrace: {
                  frames: mockSentryParsedFrames,
                },
              },
            ],
          },
        },
        {
          syntheticException: {
            stack: mockRawStack,
          } as unknown as Error,
        },
      );

      expect(symbolicatedEvent).toStrictEqual(<Event>{
        threads: {
          values: [
            {
              stacktrace: {
                frames: [
                  {
                    function: 'bar',
                    filename: '/User/project/node_modules/bar/bar.js',
                    lineno: 2,
                    colno: 2,
                    in_app: false,
                  },
                  {
                    function: 'foo',
                    filename: '/User/project/foo.js',
                    lineno: 1,
                    colno: 1,
                    in_app: true,
                  },
                ],
              },
            },
          ],
        },
      });
    });

    it('skips first frame (callee) for exception', async () => {
      const symbolicatedEvent = await executeIntegrationFor(
        {
          exception: {
            values: [
              {
                type: 'Error',
                value: 'Error: test',
                stacktrace: {
                  frames: mockSentryParsedFrames,
                },
              },
            ],
          },
        },
        {
          originalException: {
            stack: mockRawStack,
            framesToPop: 2,
            // The current behavior matches https://github.com/getsentry/sentry-javascript/blob/739d904342aaf9327312f409952f14ceff4ae1ab/packages/utils/src/stacktrace.ts#L23
            // 2 for first line with the Error message
          },
        },
      );

      expect(symbolicatedEvent).toStrictEqual(<Event>{
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Error: test',
              stacktrace: {
                frames: [
                  {
                    function: 'bar',
                    filename: '/User/project/node_modules/bar/bar.js',
                    lineno: 2,
                    colno: 2,
                    in_app: false,
                  },
                ],
              },
            },
          ],
        },
      });
    });

    it('skips first frame (callee) for message', async () => {
      const symbolicatedEvent = await executeIntegrationFor(
        {
          threads: {
            values: [
              {
                stacktrace: {
                  frames: mockSentryParsedFrames,
                },
              },
            ],
          },
        },
        {
          syntheticException: {
            stack: mockRawStack,
            framesToPop: 2,
            // The current behavior matches https://github.com/getsentry/sentry-javascript/blob/739d904342aaf9327312f409952f14ceff4ae1ab/packages/utils/src/stacktrace.ts#L23
            // 2 for first line with the Error message
          } as unknown as Error,
        },
      );

      expect(symbolicatedEvent).toStrictEqual(<Event>{
        threads: {
          values: [
            {
              stacktrace: {
                frames: [
                  {
                    function: 'bar',
                    filename: '/User/project/node_modules/bar/bar.js',
                    lineno: 2,
                    colno: 2,
                    in_app: false,
                  },
                ],
              },
            },
          ],
        },
      });
    });
  });

  function executeIntegrationFor(mockedEvent: Event, hint: EventHint): Promise<Event | null> {
    return new Promise((resolve, reject) => {
      if (!integration) {
        throw new Error('Setup integration before executing the test.');
      }

      integration.setupOnce(async eventProcessor => {
        try {
          const processedEvent = await eventProcessor(mockedEvent, hint);
          resolve(processedEvent);
        } catch (e) {
          reject(e);
        }
      }, mockGetCurrentHub);
    });
  }
});
