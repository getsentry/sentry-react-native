import type { Hub } from '@sentry/core';
import { IdleTransaction, Transaction } from '@sentry/core';
import type { Event } from '@sentry/types';

import { StallTrackingInstrumentation } from '../../src/js/tracing/stalltracking';

const mockHub = {
  captureEvent: jest.fn(),
  getClient: jest.fn(),
};

const getLastEvent = (): Event => {
  return mockHub.captureEvent.mock.calls[mockHub.captureEvent.mock.calls.length - 1][0];
};

const expensiveOperation = () => {
  const expensiveObject: { value: string[] } = {
    value: Array(100000).fill('expensive'),
  };

  // This works in sync, so it should stall the js event loop
  for (let i = 0; i < 50; i++) {
    JSON.parse(JSON.stringify(expensiveObject));
  }
};

describe('StallTracking', () => {
  const localHub: Hub = mockHub as unknown as Hub;

  it('Stall tracking detects a JS stall', done => {
    const stallTracking = new StallTrackingInstrumentation();

    const transaction = new Transaction(
      {
        name: 'Test Transaction',
        sampled: true,
      },
      localHub,
    );
    transaction.initSpanRecorder();

    stallTracking.onTransactionStart(transaction);

    expensiveOperation();

    setTimeout(() => {
      stallTracking.onTransactionFinish(transaction);
      transaction.finish();

      const measurements = getLastEvent()?.measurements;

      expect(measurements).toBeDefined();
      if (measurements) {
        expect(measurements.stall_count.value).toBeGreaterThan(0);
        expect(measurements.stall_count.unit).toBe('none');

        expect(measurements.stall_longest_time.value).toBeGreaterThan(0);
        expect(measurements.stall_longest_time.unit).toBe('millisecond');

        expect(measurements.stall_total_time.value).toBeGreaterThan(0);
        expect(measurements.stall_total_time.unit).toBe('millisecond');
      }

      done();
    }, 500);
  });

  it('Stall tracking detects multiple JS stalls', done => {
    const stallTracking = new StallTrackingInstrumentation();

    const transaction = new Transaction(
      {
        name: 'Test Transaction',
        sampled: true,
      },
      localHub,
    );
    transaction.initSpanRecorder();

    stallTracking.onTransactionStart(transaction);

    expensiveOperation();

    setTimeout(() => {
      expensiveOperation();
    }, 200);

    setTimeout(() => {
      stallTracking.onTransactionFinish(transaction);
      transaction.finish();
      const measurements = getLastEvent()?.measurements;

      expect(measurements).toBeDefined();
      if (measurements) {
        expect(measurements.stall_count.value).toBeGreaterThanOrEqual(2);
        expect(measurements.stall_longest_time.value).toBeGreaterThan(0);
        expect(measurements.stall_total_time.value).toBeGreaterThan(0);
      }

      done();
    }, 500);
  });

  it('Stall tracking timeout is stopped after finishing all transactions (single)', () => {
    const stallTracking = new StallTrackingInstrumentation();

    const transaction = new Transaction(
      {
        name: 'Test Transaction',
        sampled: true,
      },
      localHub,
    );

    stallTracking.onTransactionStart(transaction);

    stallTracking.onTransactionFinish(transaction);
    transaction.finish();

    const measurements = getLastEvent()?.measurements;

    expect(measurements).not.toBe(null);

    expect(stallTracking.isTracking).toBe(false);
  });

  it('Stall tracking timeout is stopped after finishing all transactions (multiple)', done => {
    const stallTracking = new StallTrackingInstrumentation();

    const transaction0 = new Transaction(
      {
        name: 'Test Transaction 0',
        sampled: true,
      },
      localHub,
    );
    const transaction1 = new Transaction(
      {
        name: 'Test Transaction 1',
        sampled: true,
      },
      localHub,
    );
    const transaction2 = new Transaction(
      {
        name: 'Test Transaction 2',
        sampled: true,
      },
      localHub,
    );

    stallTracking.onTransactionStart(transaction0);
    stallTracking.onTransactionStart(transaction1);

    stallTracking.onTransactionFinish(transaction0);
    transaction0.finish();
    const measurements0 = getLastEvent()?.measurements;
    expect(measurements0).toBeDefined();

    setTimeout(() => {
      stallTracking.onTransactionFinish(transaction1);
      transaction1.finish();
      const measurements1 = getLastEvent()?.measurements;
      expect(measurements1).toBeDefined();
    }, 600);

    setTimeout(() => {
      stallTracking.onTransactionStart(transaction2);

      setTimeout(() => {
        stallTracking.onTransactionFinish(transaction2);
        transaction2.finish();
        const measurements2 = getLastEvent()?.measurements;
        expect(measurements2).not.toBe(null);

        expect(stallTracking.isTracking).toBe(false);

        done();
      }, 200);
    }, 500);

    // If the stall tracking does not correctly stop, the process will keep running. We detect this by passing --detectOpenHandles to jest.
  });

  it('Stall tracking returns measurements format on finish', () => {
    const stallTracking = new StallTrackingInstrumentation();

    const transaction = new Transaction(
      {
        name: 'Test Transaction',
        sampled: true,
      },
      localHub,
    );

    stallTracking.onTransactionStart(transaction);

    stallTracking.onTransactionFinish(transaction);
    transaction.finish();
    const measurements = getLastEvent()?.measurements;

    expect(measurements).toBeDefined();

    if (measurements) {
      expect(measurements.stall_count.value).toBe(0);
      expect(measurements.stall_longest_time.value).toBe(0);
      expect(measurements.stall_total_time.value).toBe(0);
    }
  });

  it("Stall tracking returns null on a custom endTimestamp that is not a span's", () => {
    const stallTracking = new StallTrackingInstrumentation();

    const transaction = new Transaction(
      {
        name: 'Test Transaction',
        sampled: true,
      },
      localHub,
    );

    stallTracking.onTransactionStart(transaction);

    stallTracking.onTransactionFinish(transaction, Date.now() / 1000);
    transaction.finish();
    const measurements = getLastEvent()?.measurements;

    expect(measurements).toBeUndefined();
  });

  it('Stall tracking supports endTimestamp that is from the last span (trimEnd case)', done => {
    const stallTracking = new StallTrackingInstrumentation();

    const transaction = new Transaction(
      {
        name: 'Test Transaction',
        trimEnd: true,
        sampled: true,
      },
      localHub,
    );
    transaction.initSpanRecorder();

    stallTracking.onTransactionStart(transaction);

    const span = transaction.startChild({
      description: 'Test Span',
    });

    let spanFinishTime: number | undefined;

    setTimeout(() => {
      spanFinishTime = Date.now() / 1000;

      span.finish(spanFinishTime);
    }, 100);

    setTimeout(() => {
      expect(spanFinishTime).toEqual(expect.any(Number));

      stallTracking.onTransactionFinish(transaction);
      transaction.finish();
      const measurements = getLastEvent()?.measurements;

      expect(measurements).toBeDefined();

      if (measurements) {
        expect(measurements.stall_count.value).toEqual(expect.any(Number));
        expect(measurements.stall_longest_time.value).toEqual(expect.any(Number));
        expect(measurements.stall_total_time.value).toEqual(expect.any(Number));
      }

      done();
    }, 400);
  });

  it('Stall tracking rejects endTimestamp that is from the last span if trimEnd is false (trimEnd case)', done => {
    const stallTracking = new StallTrackingInstrumentation();

    const transaction = new Transaction(
      {
        name: 'Test Transaction',
        trimEnd: false,
        sampled: true,
      },
      localHub,
    );
    transaction.initSpanRecorder();

    stallTracking.onTransactionStart(transaction);

    const span = transaction.startChild({
      description: 'Test Span',
    });

    let spanFinishTime: number | undefined;

    setTimeout(() => {
      spanFinishTime = Date.now() / 1000;

      span.finish(spanFinishTime);
    }, 100);

    setTimeout(() => {
      expect(spanFinishTime).toEqual(expect.any(Number));

      stallTracking.onTransactionFinish(transaction, spanFinishTime);
      transaction.finish();
      const measurements = getLastEvent()?.measurements;

      expect(measurements).toBeUndefined();

      done();
    }, 400);
  });

  it('Stall tracking rejects endTimestamp even if it is a span time (custom endTimestamp case)', done => {
    const stallTracking = new StallTrackingInstrumentation();

    const transaction = new Transaction(
      {
        name: 'Test Transaction',
        sampled: true,
      },
      localHub,
    );
    transaction.initSpanRecorder();

    stallTracking.onTransactionStart(transaction);

    const span = transaction.startChild({
      description: 'Test Span',
    });

    let spanFinishTime: number | undefined;

    setTimeout(() => {
      spanFinishTime = Date.now() / 1000;

      span.finish(spanFinishTime);
    }, 100);

    setTimeout(() => {
      expect(spanFinishTime).toEqual(expect.any(Number));

      if (typeof spanFinishTime === 'number') {
        stallTracking.onTransactionFinish(transaction, spanFinishTime + 0.015);
        transaction.finish();
        const evt = getLastEvent();
        const measurements = evt?.measurements;

        expect(measurements).toBeUndefined();
      }

      done();
    }, 400);
  });

  it('Stall tracking supports idleTransaction with unfinished spans', async () => {
    jest.useFakeTimers();
    const stallTracking = new StallTrackingInstrumentation();
    const idleTransaction = new IdleTransaction(
      {
        name: 'Test Transaction',
        trimEnd: true,
        sampled: true,
      },
      localHub,
      undefined,
      undefined,
    );
    idleTransaction.initSpanRecorder();

    stallTracking.onTransactionStart(idleTransaction);

    idleTransaction.registerBeforeFinishCallback((_, endTimestamp) => {
      stallTracking.onTransactionFinish(idleTransaction, endTimestamp);
    });

    // Span is never finished.
    idleTransaction.startChild({
      description: 'Test Span',
    });

    await Promise.resolve();
    jest.advanceTimersByTime(100);

    stallTracking.onTransactionFinish(idleTransaction, +0.015);
    idleTransaction.finish();

    const measurements = getLastEvent()?.measurements;

    expect(measurements).toBeDefined();

    expect(measurements?.stall_count.value).toEqual(expect.any(Number));
    expect(measurements?.stall_longest_time.value).toEqual(expect.any(Number));
    expect(measurements?.stall_total_time.value).toEqual(expect.any(Number));

    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('Stall tracking ignores unfinished spans in normal transactions', done => {
    const stallTracking = new StallTrackingInstrumentation();

    const transaction = new Transaction(
      {
        name: 'Test Transaction',
        trimEnd: true,
        sampled: true,
      },
      localHub,
    );
    transaction.initSpanRecorder();

    stallTracking.onTransactionStart(transaction);

    // Span is never finished.
    transaction.startChild({
      description: 'Test Span',
    });

    // Span will be finished
    const span = transaction.startChild({
      description: 'To Finish',
    });

    setTimeout(() => {
      span.finish();
    }, 100);

    setTimeout(() => {
      stallTracking.onTransactionFinish(transaction);
      transaction.finish();
      const measurements = getLastEvent()?.measurements;

      expect(measurements).toBeDefined();

      if (measurements) {
        expect(measurements.stall_count.value).toEqual(expect.any(Number));
        expect(measurements.stall_longest_time.value).toEqual(expect.any(Number));
        expect(measurements.stall_total_time.value).toEqual(expect.any(Number));
      }

      done();
    }, 500);
  });

  it('Stall tracking only measures stalls inside the final time when trimEnd is used', done => {
    const stallTracking = new StallTrackingInstrumentation();

    const transaction = new Transaction(
      {
        name: 'Test Transaction',
        trimEnd: true,
        sampled: true,
      },
      localHub,
    );
    transaction.initSpanRecorder();

    stallTracking.onTransactionStart(transaction);

    // Span will be finished
    const span = transaction.startChild({
      description: 'To Finish',
    });

    setTimeout(() => {
      span.finish();
    }, 200);

    setTimeout(() => {
      stallTracking.onTransactionFinish(transaction);
      transaction.finish();
      const measurements = getLastEvent()?.measurements;

      expect(measurements).toBeDefined();

      if (measurements) {
        expect(measurements.stall_count.value).toEqual(1);
        expect(measurements.stall_longest_time.value).toEqual(expect.any(Number));
        expect(measurements.stall_total_time.value).toEqual(expect.any(Number));
      }

      done();
    }, 500);

    setTimeout(() => {
      // this should be run after the span finishes, and not logged.
      expensiveOperation();
    }, 300);

    expensiveOperation();
  });

  it('Stall tracking does not track the first transaction if more than 10 are running', () => {
    const stallTracking = new StallTrackingInstrumentation();

    const transactions = new Array(11).fill(0).map((_, i) => {
      const transaction = new Transaction(
        {
          name: `Test Transaction ${i}`,
          sampled: true,
        },
        localHub,
      );

      stallTracking.onTransactionStart(transaction);

      return transaction;
    });

    stallTracking.onTransactionFinish(transactions[0]);
    transactions[0].finish();
    const measurements0 = getLastEvent()?.measurements;
    expect(measurements0).toBeUndefined();

    stallTracking.onTransactionFinish(transactions[1]);
    transactions[1].finish();
    const measurements1 = getLastEvent()?.measurements;
    expect(measurements1).toBeDefined();

    transactions.slice(2).forEach(transaction => {
      stallTracking.onTransactionFinish(transaction);
      transaction.finish();
    });
  });
});
