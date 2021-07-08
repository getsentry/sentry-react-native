import { IdleTransaction, Span, Transaction } from "@sentry/tracing";

import { StallTracking } from "../../src/js/integrations";

const expensiveOperation = () => {
  const expensiveObject: { value: string[] } = {
    value: Array(100000).fill("expensive"),
  };

  // This works in sync, so it should stall the js event loop
  for (let i = 0; i < 50; i++) {
    JSON.parse(JSON.stringify(expensiveObject));
  }
};

describe("StallTracking", () => {
  it("Stall tracking detects a JS stall", (done) => {
    const stallTracking = new StallTracking();

    const transaction = new Transaction({
      name: "Test Transaction",
    });
    transaction.initSpanRecorder();

    const finishTracking = stallTracking.registerTransactionStart(transaction);

    expensiveOperation();

    setTimeout(() => {
      const measurements = finishTracking();

      expect(measurements).not.toEqual(null);
      if (measurements !== null) {
        expect(measurements.stall_count.value).toBeGreaterThan(0);
        expect(measurements.stall_longest_time.value).toBeGreaterThan(0);
        expect(measurements.stall_total_time.value).toBeGreaterThan(0);
      }

      done();
    }, 500);
  });

  it("Stall tracking detects multiple JS stalls", (done) => {
    const stallTracking = new StallTracking();

    const transaction = new Transaction({
      name: "Test Transaction",
    });
    transaction.initSpanRecorder();

    const finishTracking = stallTracking.registerTransactionStart(transaction);

    expensiveOperation();

    setTimeout(() => {
      expensiveOperation();
    }, 200);

    setTimeout(() => {
      const measurements = finishTracking();

      expect(measurements).not.toEqual(null);
      if (measurements !== null) {
        expect(measurements.stall_count.value).toBe(2);
        expect(measurements.stall_longest_time.value).toBeGreaterThan(0);
        expect(measurements.stall_total_time.value).toBeGreaterThan(0);
      }

      done();
    }, 500);
  });

  it("Stall tracking timeout is stopped after finishing all transactions (single)", () => {
    const stallTracking = new StallTracking();

    const transaction = new Transaction({
      name: "Test Transaction",
    });

    const finishTracking = stallTracking.registerTransactionStart(transaction);

    const measurements = finishTracking();

    expect(measurements).not.toBe(null);

    expect(stallTracking.isTracking).toBe(false);
  });

  it("Stall tracking timeout is stopped after finishing all transactions (multiple)", (done) => {
    const stallTracking = new StallTracking();

    const transaction0 = new Transaction({
      name: "Test Transaction 0",
    });
    const transaction1 = new Transaction({
      name: "Test Transaction 1",
    });
    const transaction2 = new Transaction({
      name: "Test Transaction 2",
    });

    const finishTracking0 = stallTracking.registerTransactionStart(
      transaction0
    );
    const finishTracking1 = stallTracking.registerTransactionStart(
      transaction1
    );

    const measurements0 = finishTracking0();
    expect(measurements0).not.toBe(null);

    setTimeout(() => {
      const measurements1 = finishTracking1();
      expect(measurements1).not.toBe(null);
    }, 600);

    setTimeout(() => {
      const finishTracking2 = stallTracking.registerTransactionStart(
        transaction2
      );

      setTimeout(() => {
        const measurements2 = finishTracking2();
        expect(measurements2).not.toBe(null);

        expect(stallTracking.isTracking).toBe(false);

        done();
      }, 200);
    }, 500);

    // If the stall tracking does not correctly stop, the process will keep running. We detect this by passing --detectOpenHandles to jest.
  });

  it("Stall tracking returns measurements format on finish", () => {
    const stallTracking = new StallTracking();

    const transaction = new Transaction({
      name: "Test Transaction",
    });

    const finishTracking = stallTracking.registerTransactionStart(transaction);

    const measurements = finishTracking();

    expect(measurements).not.toBe(null);

    if (measurements !== null) {
      expect(measurements.stall_count.value).toBe(0);
      expect(measurements.stall_longest_time.value).toBe(0);
      expect(measurements.stall_total_time.value).toBe(0);
    }
  });

  it("Stall tracking only tracks a transaction once", () => {
    const stallTracking = new StallTracking();

    const transaction = new Transaction({
      name: "Test Transaction",
    });

    const finishTracking = stallTracking.registerTransactionStart(transaction);

    const noopFinishTracking = stallTracking.registerTransactionStart(
      transaction
    );

    const measurements = finishTracking();

    expect(measurements).not.toBe(null);

    expect(noopFinishTracking()).toBe(null);
  });

  it("Stall tracking returns null on a custom endTimestamp that is not a span's", () => {
    const stallTracking = new StallTracking();

    const transaction = new Transaction({
      name: "Test Transaction",
    });

    const finishTracking = stallTracking.registerTransactionStart(transaction);

    const measurements = finishTracking(Date.now() / 1000);

    expect(measurements).toBe(null);
  });

  it("Stall tracking supports endTimestamp that is from the last span (trimEnd case)", (done) => {
    const stallTracking = new StallTracking();

    const transaction = new Transaction({
      name: "Test Transaction",
      trimEnd: true,
    });
    transaction.initSpanRecorder();

    const finishTracking = stallTracking.registerTransactionStart(transaction);

    const span = transaction.startChild({
      description: "Test Span",
    });

    let spanFinishTime: number | undefined;

    setTimeout(() => {
      spanFinishTime = Date.now() / 1000;

      span.finish(spanFinishTime);
    }, 100);

    setTimeout(() => {
      expect(spanFinishTime).toEqual(expect.any(Number));

      const measurements = finishTracking(spanFinishTime);

      expect(measurements).not.toEqual(null);

      if (measurements !== null) {
        expect(measurements.stall_count.value).toEqual(expect.any(Number));
        expect(measurements.stall_longest_time.value).toEqual(
          expect.any(Number)
        );
        expect(measurements.stall_total_time.value).toEqual(expect.any(Number));
      }

      done();
    }, 400);
  });

  it("Stall tracking rejects endTimestamp that is from the last span if trimEnd is false (trimEnd case)", (done) => {
    const stallTracking = new StallTracking();

    const transaction = new Transaction({
      name: "Test Transaction",
      trimEnd: false,
    });
    transaction.initSpanRecorder();

    const finishTracking = stallTracking.registerTransactionStart(transaction);

    const span = transaction.startChild({
      description: "Test Span",
    });

    let spanFinishTime: number | undefined;

    setTimeout(() => {
      spanFinishTime = Date.now() / 1000;

      span.finish(spanFinishTime);
    }, 100);

    setTimeout(() => {
      expect(spanFinishTime).toEqual(expect.any(Number));

      const measurements = finishTracking(spanFinishTime);

      expect(measurements).toBe(null);

      done();
    }, 400);
  });

  it("Stall tracking rejects endTimestamp even if it is a span time (custom endTimestamp case)", (done) => {
    const stallTracking = new StallTracking();

    const transaction = new Transaction({
      name: "Test Transaction",
    });
    transaction.initSpanRecorder();

    const finishTracking = stallTracking.registerTransactionStart(transaction);

    const span = transaction.startChild({
      description: "Test Span",
    });

    let spanFinishTime: number | undefined;

    setTimeout(() => {
      spanFinishTime = Date.now() / 1000;

      span.finish(spanFinishTime);
    }, 100);

    setTimeout(() => {
      expect(spanFinishTime).toEqual(expect.any(Number));

      if (typeof spanFinishTime === "number") {
        const measurements = finishTracking(spanFinishTime + 0.015);

        expect(measurements).toBe(null);
      }

      done();
    }, 400);
  });

  it("Stall tracking supports idleTransaction with unfinished spans", (done) => {
    const stallTracking = new StallTracking();

    const idleTransaction = new IdleTransaction({
      name: "Test Transaction",
      trimEnd: true,
    });
    idleTransaction.initSpanRecorder();

    const finishTracking = stallTracking.registerTransactionStart(
      idleTransaction
    );

    idleTransaction.registerBeforeFinishCallback((_, endTimestamp) => {
      const measurements = finishTracking(endTimestamp);

      expect(measurements).not.toEqual(null);

      if (measurements !== null) {
        expect(measurements.stall_count.value).toEqual(expect.any(Number));
        expect(measurements.stall_longest_time.value).toEqual(
          expect.any(Number)
        );
        expect(measurements.stall_total_time.value).toEqual(expect.any(Number));
      }

      done();
    });

    // Span is never finished.
    idleTransaction.startChild({
      description: "Test Span",
    });

    setTimeout(() => {
      idleTransaction.finish();
    }, 100);
  });

  it("Stall tracking ignores unfinished spans in normal transactions", (done) => {
    const stallTracking = new StallTracking();

    const transaction = new Transaction({
      name: "Test Transaction",
      trimEnd: true,
    });
    transaction.initSpanRecorder();

    const finishTracking = stallTracking.registerTransactionStart(transaction);

    // Span is never finished.
    transaction.startChild({
      description: "Test Span",
    });

    // Span will be finished
    const span = transaction.startChild({
      description: "To Finish",
    });

    setTimeout(() => {
      span.finish();
    }, 100);

    setTimeout(() => {
      const measurements = finishTracking();

      expect(measurements).not.toEqual(null);

      if (measurements !== null) {
        expect(measurements.stall_count.value).toEqual(expect.any(Number));
        expect(measurements.stall_longest_time.value).toEqual(
          expect.any(Number)
        );
        expect(measurements.stall_total_time.value).toEqual(expect.any(Number));
      }

      done();
    }, 500);
  });

  it("Stall tracking only measures stalls inside the final time when trimEnd is used", (done) => {
    const stallTracking = new StallTracking();

    const transaction = new Transaction({
      name: "Test Transaction",
      trimEnd: true,
    });
    transaction.initSpanRecorder();

    const finishTracking = stallTracking.registerTransactionStart(transaction);

    // Span will be finished
    const span = transaction.startChild({
      description: "To Finish",
    });

    setTimeout(() => {
      span.finish();
    }, 200);

    setTimeout(() => {
      const measurements = finishTracking();

      expect(measurements).not.toEqual(null);

      if (measurements !== null) {
        expect(measurements.stall_count.value).toEqual(1);
        expect(measurements.stall_longest_time.value).toEqual(
          expect.any(Number)
        );
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

  it("Stall tracking discards the first transaction if more than 10 are running", () => {
    const stallTracking = new StallTracking();

    const transactionFinishes = new Array(11).fill(0).map((_, i) => {
      const transaction = new Transaction({
        name: `Test Transaction ${i}`,
      });

      return stallTracking.registerTransactionStart(transaction);
    });

    const measurements0 = transactionFinishes[0]();
    expect(measurements0).toBe(null);

    const measurements1 = transactionFinishes[1]();
    expect(measurements1).not.toBe(null);

    transactionFinishes.slice(2).forEach((finish) => finish());
  });
});
