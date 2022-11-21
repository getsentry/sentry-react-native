jest.mock('../../src/js/wrapper', () => {
  return {
    NATIVE: {
      fetchNativeFrames: jest.fn(),
      disableNativeFramesTracking: jest.fn(),
      enableNative: true,
    },
  };
});

import { Transaction } from '@sentry/tracing';
import { EventProcessor } from '@sentry/types';

import { NativeFramesInstrumentation } from '../../src/js/tracing/nativeframes';
import { NATIVE } from '../../src/js/wrapper';
import { mockFunction } from '../testutils';

beforeEach(() => {
  jest.useFakeTimers();
});

describe('NativeFramesInstrumentation', () => {
  it('Sets start frames to trace context on transaction start.', (done) => {
    const startFrames = {
      totalFrames: 100,
      slowFrames: 20,
      frozenFrames: 5,
    };
    // eslint-disable-next-line @typescript-eslint/unbound-method
    mockFunction(NATIVE.fetchNativeFrames).mockResolvedValue(startFrames);

    const instance = new NativeFramesInstrumentation(
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      (_eventProcessor) => {},
      () => true
    );

    const transaction = new Transaction({ name: 'test' });

    instance.onTransactionStart(transaction);

    setImmediate(() => {
      expect(transaction.data.__startFrames).toMatchObject(startFrames);

      expect(transaction.getTraceContext().data?.__startFrames).toMatchObject(
        startFrames
      );

      done();
    });
  });

  it('Sets measurements on the transaction event and removes startFrames from trace context.', (done) => {
    const startFrames = {
      totalFrames: 100,
      slowFrames: 20,
      frozenFrames: 5,
    };
    const finishFrames = {
      totalFrames: 200,
      slowFrames: 40,
      frozenFrames: 10,
    };
    // eslint-disable-next-line @typescript-eslint/unbound-method
    mockFunction(NATIVE.fetchNativeFrames).mockResolvedValue(startFrames);

    let eventProcessor: EventProcessor;
    const instance = new NativeFramesInstrumentation(
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      (_eventProcessor) => {
        eventProcessor = _eventProcessor;
      },
      () => true
    );

    const transaction = new Transaction({ name: 'test' });

    instance.onTransactionStart(transaction);

    setImmediate(() => {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      mockFunction(NATIVE.fetchNativeFrames).mockResolvedValue(finishFrames);

      const finishTimestamp = Date.now() / 1000;
      instance.onTransactionFinish(transaction);

      setImmediate(async () => {
        try {
          expect(eventProcessor).toBeDefined();
          if (eventProcessor) {
            const event = await eventProcessor({
              event_id: '0',
              type: 'transaction',
              transaction: transaction.name,
              contexts: {
                trace: transaction.getTraceContext(),
              },
              start_timestamp: finishTimestamp - 10,
              timestamp: finishTimestamp,
            }, {});

            jest.runOnlyPendingTimers();

            // This setImmediate needs to be here for the assertions to not be caught by the promise handler.

            expect(event).toBeDefined();

            if (event) {
              expect(event.measurements).toBeDefined();

              if (event.measurements) {
                expect(event.measurements.frames_total.value).toBe(
                  finishFrames.totalFrames - startFrames.totalFrames
                );
                expect(event.measurements.frames_total.unit).toBe('none');

                expect(event.measurements.frames_slow.value).toBe(
                  finishFrames.slowFrames - startFrames.slowFrames
                );
                expect(event.measurements.frames_slow.unit).toBe('none');

                expect(event.measurements.frames_frozen.value).toBe(
                  finishFrames.frozenFrames - startFrames.frozenFrames
                );
                expect(event.measurements.frames_frozen.unit).toBe('none');
              }

              expect(event.contexts?.trace?.data).toBeDefined();

              if (event.contexts?.trace?.data) {
                expect(
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (event.contexts.trace.data as any).__startFrames
                ).toBeUndefined();
              }
            }
          }
          done();
        } catch (e) {
          done(e);
        }
      });
    });
  });

  it('Does not set measurements on transactions without startFrames.', (done) => {
    const finishFrames = {
      totalFrames: 200,
      slowFrames: 40,
      frozenFrames: 10,
    };
    // eslint-disable-next-line @typescript-eslint/unbound-method
    mockFunction(NATIVE.fetchNativeFrames).mockResolvedValue(finishFrames);

    let eventProcessor: EventProcessor;
    const instance = new NativeFramesInstrumentation(
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      (_eventProcessor) => {
        eventProcessor = _eventProcessor;
      },
      () => true
    );

    const transaction = new Transaction({ name: 'test' });

    transaction.setData('test', {});

    setImmediate(() => {
      const finishTimestamp = Date.now() / 1000;
      instance.onTransactionFinish(transaction);

      setImmediate(async () => {
        expect(eventProcessor).toBeDefined();
        if (eventProcessor) {
          const event = await eventProcessor({
            event_id: '0',
            type: 'transaction',
            transaction: transaction.name,
            contexts: {
              trace: transaction.getTraceContext(),
            },
            start_timestamp: finishTimestamp - 10,
            timestamp: finishTimestamp,
            measurements: {},
          }, {});

          jest.runOnlyPendingTimers();

          // This setImmediate needs to be here for the assertions to not be caught by the promise handler.
          setImmediate(() => {
            expect(event).toBeDefined();

            if (event) {
              expect(event.measurements).toBeDefined();

              if (event.measurements) {
                expect(event.measurements.frames_total).toBeUndefined();
                expect(event.measurements.frames_slow).toBeUndefined();
                expect(event.measurements.frames_frozen).toBeUndefined();
              }

              expect(event.contexts?.trace?.data).toBeDefined();

              if (event.contexts?.trace?.data) {
                expect(
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (event.contexts.trace.data as any).__startFrames
                ).toBeUndefined();
              }
            }

            done();
          });
        }
      });
    });
  });

  it('Sets measurements on the transaction event and removes startFrames if finishFrames is null.', (done) => {
    const startFrames = {
      totalFrames: 100,
      slowFrames: 20,
      frozenFrames: 5,
    };
    const finishFrames = null;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    mockFunction(NATIVE.fetchNativeFrames).mockResolvedValue(startFrames);

    let eventProcessor: EventProcessor;
    const instance = new NativeFramesInstrumentation(
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      (_eventProcessor) => {
        eventProcessor = _eventProcessor;
      },
      () => true
    );

    const transaction = new Transaction({ name: 'test' });

    instance.onTransactionStart(transaction);

    setImmediate(() => {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      mockFunction(NATIVE.fetchNativeFrames).mockResolvedValue(finishFrames);

      const finishTimestamp = Date.now() / 1000;
      instance.onTransactionFinish(transaction);

      setImmediate(async () => {
        try {
          expect(eventProcessor).toBeDefined();
          if (eventProcessor) {
            const event = await eventProcessor({
              event_id: '0',
              type: 'transaction',
              transaction: transaction.name,
              contexts: {
                trace: transaction.getTraceContext(),
              },
              start_timestamp: finishTimestamp - 10,
              timestamp: finishTimestamp,
            }, {});

            jest.runOnlyPendingTimers();

            expect(event).toBeDefined();

            if (event) {
              expect(event.measurements).toBeUndefined();

              expect(event.contexts?.trace?.data).toBeDefined();

              if (event.contexts?.trace?.data) {
                expect(
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (event.contexts.trace.data as any).__startFrames
                ).toBeUndefined();
              }
            }
          }

          done();
        } catch (e) {
          done(e);
        }
      });
    });
  });

  it('Does not set measurements on the transaction event and removes startFrames if finishFrames times out.', (done) => {
    jest.useRealTimers();

    const startFrames = {
      totalFrames: 100,
      slowFrames: 20,
      frozenFrames: 5,
    };
    // eslint-disable-next-line @typescript-eslint/unbound-method
    mockFunction(NATIVE.fetchNativeFrames).mockResolvedValue(startFrames);

    let eventProcessor: EventProcessor;
    const instance = new NativeFramesInstrumentation(
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      (_eventProcessor) => {
        eventProcessor = _eventProcessor;
      },
      () => true
    );

    const transaction = new Transaction({ name: 'test' });

    instance.onTransactionStart(transaction);

    setImmediate(() => {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      mockFunction(NATIVE.fetchNativeFrames).mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        async () => new Promise(() => {})
      );

      const finishTimestamp = Date.now() / 1000;
      instance.onTransactionFinish(transaction);

      setImmediate(async () => {
        try {
          expect(eventProcessor).toBeDefined();
          if (eventProcessor) {
            const event = await eventProcessor({
              event_id: '0',
              type: 'transaction',
              transaction: transaction.name,
              contexts: {
                trace: transaction.getTraceContext(),
              },
              start_timestamp: finishTimestamp - 10,
              timestamp: finishTimestamp,
            }, {});

            expect(event).toBeDefined();

            if (event) {
              expect(event.measurements).toBeUndefined();

              expect(event.contexts?.trace?.data).toBeDefined();

              if (event.contexts?.trace?.data) {
                expect(
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (event.contexts.trace.data as any).__startFrames
                ).toBeUndefined();
              }
            }
          }
          done();
        } catch (e) {
          done(e);
        }
      });
    });
  });
});
