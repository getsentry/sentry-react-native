import { Span, Transaction } from "@sentry/tracing";

import { StallTracking } from "../../src/js/integrations";

describe("StallTracking", () => {
  it("Stall tracking detects a JS stall", async () => {
    const stallTracking = new StallTracking();

    const transaction = new Transaction({
      name: "Test Transaction",
    });
    transaction.initSpanRecorder();

    const finishTracking = stallTracking.registerTransactionStart(transaction);

    const expensiveObject: { value: string[] } = {
      value: Array(100000).fill("expensive"),
    };

    // This works in sync, so it should stall the js event loop
    for (let i = 0; i < 50; i++) {
      JSON.parse(JSON.stringify(expensiveObject));
    }

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        const measurements = finishTracking();

        expect(measurements).not.toEqual(null);
        if (measurements !== null) {
          expect(measurements.stall_count.value).toBeGreaterThan(0);
          expect(measurements.stall_longest_time.value).toBeGreaterThan(0);
          expect(measurements.stall_total_time.value).toBeGreaterThan(0);
        }

        resolve();
      }, 500);
    });
  });

  it("Stall tracking timeout is stopped after finishing all transactions (single)", () => {
    const stallTracking = new StallTracking();

    const transaction = new Transaction({
      name: "Test Transaction",
    });

    const finishTracking = stallTracking.registerTransactionStart(transaction);

    const measurements = finishTracking();

    expect(measurements).not.toBe(null);

    // If the stall tracking does not correctly stop, the process will keep running. We detect this by passing --detectOpenHandles to jest.
  });

  it("Stall tracking timeout is stopped after finishing all transactions (multiple)", async () => {
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

    await new Promise<void>((resolve) => {
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

          resolve();
        }, 200);
      }, 500);
    });

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

    const measurements = finishTracking(Date.now());

    expect(measurements).toBe(null);
  });

  it("Stall tracking supports endTimestamp that is from a span (trimEnd case)", async () => {
    const stallTracking = new StallTracking();

    const transaction = new Transaction({
      name: "Test Transaction",
    });
    transaction.initSpanRecorder();

    const finishTracking = stallTracking.registerTransactionStart(transaction);

    const span = transaction.startChild({
      description: "Test Span",
    });

    await new Promise<void>((resolve) => {
      let spanFinishTime: number | undefined;

      setTimeout(() => {
        spanFinishTime = Date.now();

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
          expect(measurements.stall_total_time.value).toEqual(
            expect.any(Number)
          );
        }

        resolve();
      }, 400);
    });
  });

  it("Stall tracking supports endTimestamp that is from a span within margin of error (custom endTimestamp case)", async () => {
    const stallTracking = new StallTracking();

    const transaction = new Transaction({
      name: "Test Transaction",
    });
    transaction.initSpanRecorder();

    const finishTracking = stallTracking.registerTransactionStart(transaction);

    const span = transaction.startChild({
      description: "Test Span",
    });

    await new Promise<void>((resolve) => {
      let spanFinishTime: number | undefined;

      setTimeout(() => {
        spanFinishTime = Date.now();

        span.finish(spanFinishTime);
      }, 100);

      setTimeout(() => {
        expect(spanFinishTime).toEqual(expect.any(Number));

        if (typeof spanFinishTime === "number") {
          const measurements = finishTracking(spanFinishTime + 15);

          expect(measurements).not.toEqual(null);

          if (measurements !== null) {
            expect(measurements.stall_count.value).toEqual(expect.any(Number));
            expect(measurements.stall_longest_time.value).toEqual(
              expect.any(Number)
            );
            expect(measurements.stall_total_time.value).toEqual(
              expect.any(Number)
            );
          }
        }

        resolve();
      }, 400);
    });
  });

  it("Stall tracking rejects endTimestamp that is from a span outside margin of error (custom endTimestamp case)", async () => {
    const stallTracking = new StallTracking();

    const transaction = new Transaction({
      name: "Test Transaction",
    });
    transaction.initSpanRecorder();

    const finishTracking = stallTracking.registerTransactionStart(transaction);

    const span = transaction.startChild({
      description: "Test Span",
    });

    await new Promise<void>((resolve) => {
      let spanFinishTime: number | undefined;

      setTimeout(() => {
        spanFinishTime = Date.now();

        span.finish(spanFinishTime);
      }, 100);

      setTimeout(() => {
        expect(spanFinishTime).toEqual(expect.any(Number));

        if (typeof spanFinishTime === "number") {
          const measurements = finishTracking(spanFinishTime + 25);

          expect(measurements).toEqual(null);
        }

        resolve();
      }, 400);
    });
  });

  it("Stall tracking flushes out the earliest finished span of a transaction after 20 spans", async () => {
    const stallTracking = new StallTracking();

    const transaction = new Transaction({
      name: "Test Transaction",
    });
    transaction.initSpanRecorder();

    const finishTracking = stallTracking.registerTransactionStart(transaction);

    const spans: Span[] = [];
    for (let i = 0; i < 21; i++) {
      spans.push(
        transaction.startChild({
          description: "Test Span",
        })
      );
    }

    await new Promise<void>((resolve) => {
      let firstSpanFinishTime: number | undefined;

      setTimeout(() => {
        firstSpanFinishTime = Date.now();

        spans[0].finish(firstSpanFinishTime);

        setTimeout(() => {
          for (const span of spans.slice(1)) {
            span.finish();
          }
        }, 50);
      }, 100);

      setTimeout(() => {
        expect(firstSpanFinishTime).toEqual(expect.any(Number));

        const measurements = finishTracking(firstSpanFinishTime);

        expect(measurements).toEqual(null);

        resolve();
      }, 400);
    });
  });
});
