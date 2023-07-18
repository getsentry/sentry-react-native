

// {"cause":{"name":"java.lang.RuntimeException","message":"The operation failed.","stackElements":[{"className":"com.sentryreactnativeamanightly.modules.TurboCrashModule","fileName":"TurboCrashModule.kt","lineNumber":10,"methodName":"getDataCrash"},{"className":"com.facebook.jni.NativeRunnable","fileName":"NativeRunnable.java","lineNumber":-2,"methodName":"run"},{"className":"android.os.Handler","fileName":"Handler.java","lineNumber":942,"methodName":"handleCallback"},{"className":"android.os.Handler","fileName":"Handler.java","lineNumber":99,"methodName":"dispatchMessage"},{"className":"com.facebook.react.bridge.queue.MessageQueueThreadHandler","fileName":"MessageQueueThreadHandler.java","lineNumber":27,"methodName":"dispatchMessage"},{"className":"android.os.Looper","fileName":"Looper.java","lineNumber":201,"methodName":"loopOnce"},{"className":"android.os.Looper","fileName":"Looper.java","lineNumber":288,"methodName":"loop"},{"className":"com.facebook.react.bridge.queue.MessageQueueThreadImpl$4","fileName":"MessageQueueThreadImpl.java","lineNumber":228,"methodName":"run"},{"className":"java.lang.Thread","fileName":"Thread.java","lineNumber":1012,"methodName":"run"}]}}

import type { Event,EventHint, ExtendedError } from '@sentry/types';

describe('NativeLinkedErrors', () => {

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
                    platform: 'node'
                  },
                ]
              },
              mechanism: {
                type: 'generic',
                handled: true
              }
            }
          ]
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
                  platform: 'node'
                },
              ]
            },
            mechanism: {
              type: 'generic',
              handled: true
            }
          }
        ]
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
                ]
              },
              mechanism: {
                type: 'generic',
                handled: true
              }
            }
          ]
        },
      },
      {
        originalException: createNewError({
          message: 'JavaScript error message',
          name: 'JavaScriptError',
          stack: 'JavaScriptError: JavaScript error message\n' +
            'at onPress (index.bundle:75:33)\n' +
            'at _performTransitionSideEffects (index.bundle:65919:22)',
          cause: {
            name: 'java.lang.RuntimeException',
            message: 'Java error message.',
            stackElements: [
              {
                className: 'com.example.modules.Crash',
                fileName: 'Crash.kt',
                lineNumber: 10,
                methodName: 'getDataCrash'
              },
              {
                className: 'com.facebook.jni.NativeRunnable',
                fileName: 'NativeRunnable.java',
                lineNumber: 2,
                methodName: 'run'
              }
            ]
          },
        }),
      },
    );

    expect(actualEvent).toEqual( <Partial<Event>> {
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
              ]
            },
            mechanism: {
              type: 'generic',
              handled: true
            }
          },
          {
            type: 'Error',
            value: 'Java error message.',
            stacktrace: {
              frames: [
                {
                  platform: 'java',
                  module: 'com.example.modules.Crash',
                  filename: 'Crash.kt',
                  lineno: 10,
                  function: 'getDataCrash'
                },
                {
                  platform: 'java',
                  module: 'com.facebook.jni.NativeRunnable',
                  filename: 'NativeRunnable.java',
                  lineno: 2,
                  function: 'run'
                },
              ],
            }
          }
        ]
      },
    });
  });

  it('adds ios objective-c cause from the original error to the event', async () => {
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
                ]
              },
              mechanism: {
                type: 'generic',
                handled: true
              }
            }
          ]
        },
      },
      {
        originalException: createNewError({
          message: 'JavaScript error message',
          name: 'JavaScriptError',
          stack: 'JavaScriptError: JavaScript error message\n' +
            'at onPress (index.bundle:75:33)\n' +
            'at _performTransitionSideEffects (index.bundle:65919:22)',
          cause: {
            name: 'Error',
            message: 'Objective-c error message.',
            stackSymbols: [
              '0   CoreFoundation                      0x0000000180437330 __exceptionPreprocess + 172',
              '1   libobjc.A.dylib                     0x0000000180051274 objc_exception_throw + 56',
              '2   RNTester                            0x0000000103535900 -[RCTSampleTurboModule getObjectThrows:] + 120',
            ]
          },
        }),
      },
    );

    expect(actualEvent).toEqual(<Partial<Event>>{
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
              ]
            },
            mechanism: {
              type: 'generic',
              handled: true
            }
          },
          {
            type: 'Error',
            value: 'Objective-c error message.',
            stacktrace: {
              frames: [
                {
                  platform: 'cocoa',
                  package: 'CoreFoundation',
                  function: '__exceptionPreprocess',
                  instruction_addr: '0000000180437330',
                },
                {
                  platform: 'cocoa',
                  package: 'libobjc.A.dylib',
                  function: 'objc_exception_throw',
                  instruction_addr: '0000000180051274',
                },
                {
                  platform: 'cocoa',
                  package: 'RNTester',
                  function: '-[RCTSampleTurboModule getObjectThrows:]',
                  instruction_addr: '0000000103535900',
                },
              ],
            }
          }
        ]
      },
    });
  });

  it('adds ios objective-c cause from the original error to the event', async () => {
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
                ]
              },
              mechanism: {
                type: 'generic',
                handled: true
              }
            }
          ]
        },
      },
      {
        originalException: createNewError({
          message: 'JavaScript error message',
          name: 'JavaScriptError',
          stack: 'JavaScriptError: JavaScript error message\n' +
            'at onPress (index.bundle:75:33)\n' +
            'at _performTransitionSideEffects (index.bundle:65919:22)',
          cause: {
            name: 'Error',
            message: 'Objective-c error message.',
            stackReturnAddresses: [
              6446871344,
              6442783348,
              4350761216,
            ],
          },
        }),
      },
    );

    expect(actualEvent).toEqual( <Partial<Event>> {
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
              ]
            },
            mechanism: {
              type: 'generic',
              handled: true
            }
          },
          {
            type: 'Error',
            value: 'Objective-c error message.',
            stacktrace: {
              frames: [
                {
                  platform: 'cocoa',
                  instruction_addr: '0000000180437330',
                },
                {
                  platform: 'cocoa',
                  instruction_addr: '0000000180051274',
                },
                {
                  platform: 'cocoa',
                  instruction_addr: '0000000103535900',
                },
              ],
            }
          }
        ]
      },
    });
  });
});

function executeIntegrationFor(_mockedEvent: Event, _mockedHint: EventHint): Promise<Event | null> {
  // const integration = new ReactNativeInfo();
  // return new Promise((resolve, reject) => {
  //   integration.setupOnce(async eventProcessor => {
  //     try {
  //       const processedEvent = await eventProcessor(mockedEvent, mockedHint);
  //       resolve(processedEvent);
  //     } catch (e) {
  //       reject(e);
  //     }
  //   });
  // });
  return Promise.resolve(null);
}

function createNewError(from: {
  message: string;
  name?: string;
  stack?: string;
  cause?: unknown;
}): ExtendedError {
  const error: ExtendedError = new Error(from.message);
  if (from.name) {
    error.name = from.name;
  }
  error.stack = from.stack;
  error.cause = from.cause;
  return error;
}
