import { defaultStackParser } from '@sentry/browser';
import type { DebugImage, Event, EventHint, ExtendedError, Hub } from '@sentry/types';

import { NativeLinkedErrors } from '../../src/js/integrations/nativelinkederrors';
import type { NativeStackFrames } from '../../src/js/NativeRNSentry';
import { NATIVE } from '../../src/js/wrapper';

jest.mock('../../src/js/wrapper');

(NATIVE.fetchNativePackageName as jest.Mock).mockImplementation(() => Promise.resolve<string>('mock.native.bundle.id'));

(NATIVE.fetchNativeStackFramesBy as jest.Mock).mockImplementation(() => Promise.resolve<null>(null));

describe('NativeLinkedErrors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps event without cause as is', async () => {
    const actualEvent = await executeIntegrationFor(
      {
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Captured exception',
              stacktrace: {
                frames: [
                  {
                    colno: 17,
                    filename: 'app:///Pressability.js',
                    function: '_performTransitionSideEffects',
                    in_app: false,
                    platform: 'node',
                  },
                ],
              },
              mechanism: {
                type: 'generic',
                handled: true,
              },
            },
          ],
        },
      },
      {},
    );

    expect(actualEvent).toEqual({
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Captured exception',
            stacktrace: {
              frames: [
                {
                  colno: 17,
                  filename: 'app:///Pressability.js',
                  function: '_performTransitionSideEffects',
                  in_app: false,
                  platform: 'node',
                },
              ],
            },
            mechanism: {
              type: 'generic',
              handled: true,
            },
          },
        ],
      },
    });
  });

  it('adds android java cause from the original error to the event', async () => {
    const actualEvent = await executeIntegrationFor(
      {
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Captured exception',
              stacktrace: {
                frames: [
                  {
                    colno: 17,
                    filename: 'app:///Pressability.js',
                    function: '_performTransitionSideEffects',
                  },
                ],
              },
              mechanism: {
                type: 'generic',
                handled: true,
              },
            },
          ],
        },
      },
      {
        originalException: createNewError({
          message: 'JavaScript error message',
          name: 'JavaScriptError',
          stack:
            'JavaScriptError: JavaScript error message\n' +
            'at onPress (index.bundle:75:33)\n' +
            'at _performTransitionSideEffects (index.bundle:65919:22)',
          cause: {
            name: 'java.lang.RuntimeException',
            message: 'Java error message.',
            stackElements: [
              {
                className: 'mock.native.bundle.id.Crash',
                fileName: 'Crash.kt',
                lineNumber: 10,
                methodName: 'getDataCrash',
              },
              {
                className: 'com.facebook.jni.NativeRunnable',
                fileName: 'NativeRunnable.java',
                lineNumber: 2,
                methodName: 'run',
              },
            ],
          },
        }),
      },
    );

    expect(NATIVE.fetchNativePackageName).toBeCalledTimes(1);
    expect(NATIVE.fetchNativeStackFramesBy).not.toBeCalled();
    expect(actualEvent).toEqual(
      expect.objectContaining(<Partial<Event>>{
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Captured exception',
              stacktrace: {
                frames: [
                  {
                    colno: 17,
                    filename: 'app:///Pressability.js',
                    function: '_performTransitionSideEffects',
                  },
                ],
              },
              mechanism: {
                type: 'generic',
                handled: true,
              },
            },
            {
              type: 'java.lang.RuntimeException',
              value: 'Java error message.',
              stacktrace: {
                frames: [
                  expect.objectContaining({
                    platform: 'java',
                    module: 'com.facebook.jni.NativeRunnable',
                    filename: 'NativeRunnable.java',
                    lineno: 2,
                    function: 'run',
                  }),
                  expect.objectContaining({
                    platform: 'java',
                    module: 'mock.native.bundle.id.Crash',
                    filename: 'Crash.kt',
                    lineno: 10,
                    function: 'getDataCrash',
                    in_app: true,
                  }),
                ],
              },
            },
          ],
        },
      }),
    );
  });

  it('adds ios objective-c cause from the original error to the event', async () => {
    (NATIVE.fetchNativeStackFramesBy as jest.Mock).mockImplementation(() =>
      Promise.resolve<NativeStackFrames>({
        frames: [
          // Locally symbolicated frame
          {
            platform: 'cocoa',
            package: 'CoreFoundation',
            function: '__exceptionPreprocess',
            symbol_addr: '0x0000000180437330',
            instruction_addr: '0x0000000180437330',
            image_addr: '0x7fffe668e000',
          },
          {
            platform: 'cocoa',
            function: 'objc_exception_throw',
            instruction_addr: '0x0000000180051274',
            image_addr: '0x7fffe668e000',
          },
          {
            platform: 'cocoa',
            package: 'mock.native.bundle.id',
            instruction_addr: '0x0000000103535900',
            image_addr: '0x7fffe668e000',
            in_app: true,
          },
        ],
        debugMetaImages: [
          {
            type: 'macho',
            debug_id: '84a04d24-0e60-3810-a8c0-90a65e2df61a',
            code_file: '/usr/lib/libDiagnosticMessagesClient.dylib',
            image_addr: '0x7fffe668e000',
            image_size: 8192,
            image_vmaddr: '0x40000',
          },
        ],
      }),
    );

    const actualEvent = await executeIntegrationFor(
      {
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Captured exception',
              stacktrace: {
                frames: [
                  {
                    colno: 17,
                    filename: 'app:///Pressability.js',
                    function: '_performTransitionSideEffects',
                  },
                ],
              },
              mechanism: {
                type: 'generic',
                handled: true,
              },
            },
          ],
        },
      },
      {
        originalException: createNewError({
          message: 'JavaScript error message',
          name: 'JavaScriptError',
          stack:
            'JavaScriptError: JavaScript error message\n' +
            'at onPress (index.bundle:75:33)\n' +
            'at _performTransitionSideEffects (index.bundle:65919:22)',
          cause: {
            name: 'Error',
            message: 'Objective-c error message.',
            stackSymbols: [
              '0   CoreFoundation                      0x0000000180437330 __exceptionPreprocess + 172',
              '1   libobjc.A.dylib                     0x0000000180051274 objc_exception_throw + 56',
              '2   mock.native.bundle.id               0x0000000103535900 -[RCTSampleTurboModule getObjectThrows:] + 120',
            ],
            stackReturnAddresses: [6446871344, 6442783348, 4350761216],
          },
        }),
      },
    );

    expect(NATIVE.fetchNativePackageName).toBeCalledTimes(1);
    expect(NATIVE.fetchNativeStackFramesBy).toBeCalledTimes(1);
    expect(NATIVE.fetchNativeStackFramesBy).toBeCalledWith([6446871344, 6442783348, 4350761216]);
    expect(actualEvent).toEqual(
      expect.objectContaining(<Partial<Event>>{
        debug_meta: {
          images: [
            {
              type: 'macho',
              debug_id: '84a04d24-0e60-3810-a8c0-90a65e2df61a',
              code_file: '/usr/lib/libDiagnosticMessagesClient.dylib',
              image_addr: '0x7fffe668e000',
              image_size: 8192,
              image_vmaddr: '0x40000',
            } as unknown as DebugImage,
          ],
        },
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Captured exception',
              stacktrace: {
                frames: [
                  {
                    colno: 17,
                    filename: 'app:///Pressability.js',
                    function: '_performTransitionSideEffects',
                  },
                ],
              },
              mechanism: {
                type: 'generic',
                handled: true,
              },
            },
            {
              type: 'Error',
              value: 'Objective-c error message.',
              stacktrace: {
                frames: [
                  expect.objectContaining({
                    platform: 'cocoa',
                    package: 'mock.native.bundle.id',
                    instruction_addr: '0x0000000103535900',
                    image_addr: '0x7fffe668e000',
                    in_app: true,
                  }),
                  expect.objectContaining({
                    platform: 'cocoa',
                    function: 'objc_exception_throw',
                    instruction_addr: '0x0000000180051274',
                    image_addr: '0x7fffe668e000',
                  }),
                  expect.objectContaining({
                    platform: 'cocoa',
                    package: 'CoreFoundation',
                    function: '__exceptionPreprocess',
                    symbol_addr: '0x0000000180437330',
                    instruction_addr: '0x0000000180437330',
                    image_addr: '0x7fffe668e000',
                  }),
                ],
              },
            },
          ],
        },
      }),
    );
  });
});

function executeIntegrationFor(mockedEvent: Event, mockedHint: EventHint): Promise<Event | null> {
  const integration = new NativeLinkedErrors();
  return new Promise((resolve, reject) => {
    integration.setupOnce(
      async eventProcessor => {
        try {
          const processedEvent = await eventProcessor(mockedEvent, mockedHint);
          resolve(processedEvent);
        } catch (e) {
          reject(e);
        }
      },
      () =>
        ({
          getClient: () => ({
            getOptions: () => ({
              stackParser: defaultStackParser,
            }),
          }),
          getIntegration: () => integration,
        } as unknown as Hub),
    );
  });
}

function createNewError(from: { message: string; name?: string; stack?: string; cause?: unknown }): ExtendedError {
  const error: ExtendedError = new Error(from.message);
  if (from.name) {
    error.name = from.name;
  }
  error.stack = from.stack;
  error.cause = from.cause;
  return error;
}
