jest.mock('../../src/js/integrations/debugsymbolicatorutils');

import type { Client, Event, EventHint, StackFrame } from '@sentry/types';

import { debugSymbolicatorIntegration } from '../../src/js/integrations/debugsymbolicator';
import {
  fetchSourceContext,
  getDevServer,
  parseErrorStack,
  symbolicateStackTrace,
} from '../../src/js/integrations/debugsymbolicatorutils';
import type * as ReactNative from '../../src/js/vendor/react-native';

async function processEvent(mockedEvent: Event, mockedHint: EventHint): Promise<Event | null> {
  return debugSymbolicatorIntegration().processEvent!(mockedEvent, mockedHint, {} as Client);
}

describe('Debug Symbolicator Integration', () => {
  beforeEach(() => {
    (parseErrorStack as jest.Mock).mockReturnValue([]);
    (symbolicateStackTrace as jest.Mock).mockReturnValue(
      Promise.resolve(<ReactNative.SymbolicatedStackTrace>{
        stack: [],
      }),
    );
    (getDevServer as jest.Mock).mockReturnValue(<ReactNative.DevServerInfo>{
      url: 'http://localhost:8081',
    });
    (fetchSourceContext as jest.Mock).mockReturnValue(Promise.resolve(null));
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

    const customMockRawStack = (errorNumber: number, value: number) =>
      `Error${errorNumber}: This is mocked error stack trace
      at foo${errorNumber} (http://localhost:8081/index.bundle?platform=ios&dev=true&minify=false:${value}:${value})
      at bar${errorNumber} (http://localhost:8081/index.bundle?platform=ios&dev=true&minify=false:${value + 1}:${
        value + 1
      })
      at baz${errorNumber} (native)
      `;

    const customMockSentryParsedFrames = (errorNumber: number, value: number): Array<StackFrame> => {
      const value2 = value + 1;
      return [
        {
          function: `[native] baz${errorNumber}`,
        },
        {
          function: `bar${errorNumber}`,
          filename: `http://localhost:8081/index.bundle?platform=ios&dev=true&minify=false:${value}:${value}`,
          lineno: value,
          colno: value,
        },
        {
          function: `foo${errorNumber}`,
          filename: `http://localhost:8081/index.bundle?platform=ios&dev=true&minify=false:${value2}:${value2}`,
          lineno: value2,
          colno: value2,
        },
      ];
    };

    beforeEach(() => {
      (parseErrorStack as jest.Mock).mockReturnValue(<Array<ReactNative.StackFrame>>[
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

      (symbolicateStackTrace as jest.Mock).mockReturnValue(
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
      const symbolicatedEvent = await processEvent(
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
      const symbolicatedEvent = await processEvent(
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
      const symbolicatedEvent = await processEvent(
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
      const symbolicatedEvent = await processEvent(
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
      const symbolicatedEvent = await processEvent(
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

    it('should symbolicate error with cause ', async () => {
      (parseErrorStack as jest.Mock)
        .mockReturnValueOnce(<Array<ReactNative.StackFrame>>[
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
        ])
        .mockReturnValueOnce(<Array<ReactNative.StackFrame>>[
          {
            file: 'http://localhost:8081/index.bundle?platform=ios&dev=true&minify=false',
            lineNumber: 3,
            column: 3,
            methodName: 'foo2',
          },
          {
            file: 'http://localhost:8081/index.bundle?platform=ios&dev=true&minify=false',
            lineNumber: 4,
            column: 4,
            methodName: 'bar2',
          },
        ]);
      (symbolicateStackTrace as jest.Mock)
        .mockReturnValueOnce(
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
        )
        .mockReturnValueOnce(
          Promise.resolve(<ReactNative.SymbolicatedStackTrace>{
            stack: [
              {
                file: '/User/project/foo2.js',
                lineNumber: 3,
                column: 3,
                methodName: 'foo2',
              },
              {
                file: '/User/project/node_modules/bar/bar2.js',
                lineNumber: 4,
                column: 4,
                methodName: 'bar2',
              },
            ],
          }),
        );

      const symbolicatedEvent = await processEvent(
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
              {
                type: 'Error2',
                value: 'Error2: test',
                stacktrace: {
                  frames: customMockSentryParsedFrames(2, 2),
                },
              },
            ],
          },
        },
        {
          originalException: {
            stack: mockRawStack,
            cause: {
              stack: customMockRawStack(1, 1),
            },
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
            {
              type: 'Error2',
              value: 'Error2: test',
              stacktrace: {
                frames: [
                  {
                    function: 'bar2',
                    filename: '/User/project/node_modules/bar/bar2.js',
                    lineno: 4,
                    colno: 4,
                    in_app: false,
                  },
                  {
                    function: 'foo2',
                    filename: '/User/project/foo2.js',
                    lineno: 3,
                    colno: 3,
                    in_app: true,
                  },
                ],
              },
            },
          ],
        },
      });
    });

    it('should symbolicate error with multiple causes ', async () => {
      const setupStackFrame = (value: number): Array<ReactNative.StackFrame> => [
        {
          file: 'http://localhost:8081/index.bundle?platform=ios&dev=true&minify=false',
          lineNumber: value,
          column: value,
          methodName: `foo${value}`,
        },
        {
          file: 'http://localhost:8081/index.bundle?platform=ios&dev=true&minify=false',
          lineNumber: value + 1,
          column: value + 1,
          methodName: `bar${value}`,
        },
      ];

      (parseErrorStack as jest.Mock)
        .mockReturnValueOnce(setupStackFrame(1))
        .mockReturnValueOnce(setupStackFrame(3))
        .mockReturnValueOnce(setupStackFrame(5))
        .mockReturnValueOnce(setupStackFrame(7));

      const mocksymbolicateStackTrace = (value: number): ReactNative.SymbolicatedStackTrace => ({
        stack: [
          {
            file: `/User/project/foo${value}.js`,
            lineNumber: value,
            column: value,
            methodName: `foo${value}`,
          },
          {
            file: `/User/project/node_modules/bar/bar${value + 1}.js`,
            lineNumber: value + 1,
            column: value + 1,
            methodName: `bar${value + 1}`,
          },
        ],
      });
      (symbolicateStackTrace as jest.Mock)
        .mockReturnValueOnce(Promise.resolve(mocksymbolicateStackTrace(1)))
        .mockReturnValueOnce(Promise.resolve(mocksymbolicateStackTrace(3)))
        .mockReturnValueOnce(Promise.resolve(mocksymbolicateStackTrace(5)))
        .mockReturnValueOnce(Promise.resolve(mocksymbolicateStackTrace(7)));

      const symbolicatedEvent = await processEvent(
        {
          exception: {
            values: [
              {
                type: 'Error1',
                value: 'Error1: test',
                stacktrace: {
                  frames: customMockSentryParsedFrames(1, 1),
                },
              },
              {
                type: 'Error2',
                value: 'Error2: test',
                stacktrace: {
                  frames: customMockSentryParsedFrames(2, 2),
                },
              },
              {
                type: 'Error3',
                value: 'Error3: test',
                stacktrace: {
                  frames: customMockSentryParsedFrames(3, 3),
                },
              },
              {
                type: 'Error4',
                value: 'Error4: test',
                stacktrace: {
                  frames: customMockSentryParsedFrames(4, 4),
                },
              },
            ],
          },
        },
        {
          originalException: {
            stack: customMockRawStack(1, 1),
            cause: {
              stack: customMockRawStack(3, 3),
              cause: {
                stack: customMockRawStack(5, 5),
                cause: {
                  stack: customMockRawStack(7, 7),
                },
              },
            },
          },
        },
      );

      expect(symbolicatedEvent).toStrictEqual(<Event>{
        exception: {
          values: [
            {
              type: 'Error1',
              value: 'Error1: test',
              stacktrace: {
                frames: [
                  {
                    function: 'bar2',
                    filename: '/User/project/node_modules/bar/bar2.js',
                    lineno: 2,
                    colno: 2,
                    in_app: false,
                  },
                  {
                    function: 'foo1',
                    filename: '/User/project/foo1.js',
                    lineno: 1,
                    colno: 1,
                    in_app: true,
                  },
                ],
              },
            },
            {
              type: 'Error2',
              value: 'Error2: test',
              stacktrace: {
                frames: [
                  {
                    function: 'bar4',
                    filename: '/User/project/node_modules/bar/bar4.js',
                    lineno: 4,
                    colno: 4,
                    in_app: false,
                  },
                  {
                    function: 'foo3',
                    filename: '/User/project/foo3.js',
                    lineno: 3,
                    colno: 3,
                    in_app: true,
                  },
                ],
              },
            },
            {
              type: 'Error3',
              value: 'Error3: test',
              stacktrace: {
                frames: [
                  {
                    function: 'bar6',
                    filename: '/User/project/node_modules/bar/bar6.js',
                    lineno: 6,
                    colno: 6,
                    in_app: false,
                  },
                  {
                    function: 'foo5',
                    filename: '/User/project/foo5.js',
                    lineno: 5,
                    colno: 5,
                    in_app: true,
                  },
                ],
              },
            },
            {
              type: 'Error4',
              value: 'Error4: test',
              stacktrace: {
                frames: [
                  {
                    function: 'bar8',
                    filename: '/User/project/node_modules/bar/bar8.js',
                    lineno: 8,
                    colno: 8,
                    in_app: false,
                  },
                  {
                    function: 'foo7',
                    filename: '/User/project/foo7.js',
                    lineno: 7,
                    colno: 7,
                    in_app: true,
                  },
                ],
              },
            },
          ],
        },
      });
    });

    it('should symbolicate error with different amount of exception hints ', async () => {
      // Example: Sentry captures an Error with 20 Causes, but limits the captured exceptions to
      // 5 in event.exception. Meanwhile, hint.originalException contains all 20 items.
      // This test ensures no exceptions are thrown in an uneven scenario and ensures all
      // consumed errors are symbolicated.

      const setupStackFrame = (value: number): Array<ReactNative.StackFrame> => [
        {
          file: 'http://localhost:8081/index.bundle?platform=ios&dev=true&minify=false',
          lineNumber: value,
          column: value,
          methodName: `foo${value}`,
        },
        {
          file: 'http://localhost:8081/index.bundle?platform=ios&dev=true&minify=false',
          lineNumber: value + 1,
          column: value + 1,
          methodName: `bar${value}`,
        },
      ];

      (parseErrorStack as jest.Mock)
        .mockReturnValueOnce(setupStackFrame(1))
        .mockReturnValueOnce(setupStackFrame(3))
        .mockReturnValueOnce(setupStackFrame(5))
        .mockReturnValueOnce(setupStackFrame(7));

      const mocksymbolicateStackTrace = (value: number): ReactNative.SymbolicatedStackTrace => ({
        stack: [
          {
            file: `/User/project/foo${value}.js`,
            lineNumber: value,
            column: value,
            methodName: `foo${value}`,
          },
          {
            file: `/User/project/node_modules/bar/bar${value + 1}.js`,
            lineNumber: value + 1,
            column: value + 1,
            methodName: `bar${value + 1}`,
          },
        ],
      });
      (symbolicateStackTrace as jest.Mock)
        .mockReturnValueOnce(Promise.resolve(mocksymbolicateStackTrace(1)))
        .mockReturnValueOnce(Promise.resolve(mocksymbolicateStackTrace(3)))
        .mockReturnValueOnce(Promise.resolve(mocksymbolicateStackTrace(5)))
        .mockReturnValueOnce(Promise.resolve(mocksymbolicateStackTrace(7)));

      const symbolicatedEvent = await processEvent(
        {
          exception: {
            values: [
              {
                type: 'Error1',
                value: 'Error1: test',
                stacktrace: {
                  frames: customMockSentryParsedFrames(1, 1),
                },
              },
              {
                type: 'Error2',
                value: 'Error2: test',
                stacktrace: {
                  frames: customMockSentryParsedFrames(2, 2),
                },
              },
            ],
          },
        },
        {
          originalException: {
            stack: customMockRawStack(1, 1),
            cause: {
              stack: customMockRawStack(3, 3),
              cause: {
                stack: customMockRawStack(5, 5),
                cause: {
                  stack: customMockRawStack(7, 7),
                },
              },
            },
          },
        },
      );

      expect(symbolicatedEvent).toStrictEqual(<Event>{
        exception: {
          values: [
            {
              type: 'Error1',
              value: 'Error1: test',
              stacktrace: {
                frames: [
                  {
                    function: 'bar2',
                    filename: '/User/project/node_modules/bar/bar2.js',
                    lineno: 2,
                    colno: 2,
                    in_app: false,
                  },
                  {
                    function: 'foo1',
                    filename: '/User/project/foo1.js',
                    lineno: 1,
                    colno: 1,
                    in_app: true,
                  },
                ],
              },
            },
            {
              type: 'Error2',
              value: 'Error2: test',
              stacktrace: {
                frames: [
                  {
                    function: 'bar4',
                    filename: '/User/project/node_modules/bar/bar4.js',
                    lineno: 4,
                    colno: 4,
                    in_app: false,
                  },
                  {
                    function: 'foo3',
                    filename: '/User/project/foo3.js',
                    lineno: 3,
                    colno: 3,
                    in_app: true,
                  },
                ],
              },
            },
          ],
        },
      });
    });
  });
});
