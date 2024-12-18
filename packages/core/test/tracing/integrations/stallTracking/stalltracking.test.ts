import type { Span } from '@sentry/core';
import {
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  setCurrentClient,
  startIdleSpan,
  startSpan,
  startSpanManual,
  timestampInSeconds,
} from '@sentry/core';

import { stallTrackingIntegration } from '../../../../src/js/tracing/integrations/stalltracking';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';
import { expectNonZeroStallMeasurements, expectStallMeasurements } from './stalltrackingutils';

jest.useFakeTimers({ advanceTimers: true });

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
  let client: TestClient;

  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();

    const options = getDefaultTestClientOptions({
      tracesSampleRate: 1.0,
      enableStallTracking: true,
      integrations: [stallTrackingIntegration()],
      enableAppStartTracking: false,
    });
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('Stall tracking detects a JS stall', async () => {
    startSpan({ name: 'Stall will happen during this span' }, () => {
      expensiveOperation();
      // Ensures at least one iteration of the JS loop check
      // (executed the last scheduled one which might be also the first scheduled)
      jest.runOnlyPendingTimers();
    });

    await client.flush();

    expectNonZeroStallMeasurements(client.event?.measurements);
  });

  it('Stall tracking detects multiple JS stalls', async () => {
    startSpan({ name: 'Stall will happen during this span' }, () => {
      expensiveOperation();
      // Ensures at least one iteration of the JS loop check
      // (executed the last scheduled one which might be also the first scheduled)
      jest.runOnlyPendingTimers();

      expensiveOperation();
      jest.runOnlyPendingTimers();
    });

    await client.flush();

    const measurements = client.event?.measurements;
    expectNonZeroStallMeasurements(measurements);
    expect(measurements?.stall_count.value).toBeGreaterThanOrEqual(2);
  });

  it('Stall tracking timeout is stopped after finishing all transactions (single)', async () => {
    startSpan({ name: 'Stall will happen during this span' }, () => {
      expensiveOperation();
      // Ensures at least one iteration of the JS loop check
      // (executed the last scheduled one which might be also the first scheduled)
      jest.runOnlyPendingTimers();
    });

    await client.flush();

    jest.runAllTimers(); // If tracking would be running there would always be a new timer creating infinite loop

    expectNonZeroStallMeasurements(client.event?.measurements);
  });

  it('Stall tracking timeout is stopped after finishing all transactions (multiple)', async () => {
    // new `startSpan` API doesn't allow creation of multiple transactions
    const t0 = startSpanManual({ name: 'Test Transaction 0', forceTransaction: true }, span => span);
    const t1 = startSpanManual({ name: 'Test Transaction 1', forceTransaction: true }, span => span);
    const t2 = startSpanManual({ name: 'Test Transaction 2', forceTransaction: true }, span => span);

    t0.end();
    jest.runOnlyPendingTimers();
    t1.end();
    jest.runOnlyPendingTimers();
    t2.end();
    jest.runOnlyPendingTimers();

    await client.flush();

    jest.runAllTimers(); // If tracking would be running there would always be a new timer creating infinite loop

    const measurements2 = client.eventQueue.pop()?.measurements;
    const measurements1 = client.eventQueue.pop()?.measurements;
    const measurements0 = client.eventQueue.pop()?.measurements;

    expectStallMeasurements(measurements0);
    expectStallMeasurements(measurements1);
    expectStallMeasurements(measurements2);
  });

  it('Stall tracking returns measurements format on finish', async () => {
    startSpan({ name: 'Stall will happen during this span' }, () => {
      // no expensive operation
    });

    await client.flush();

    expectStallMeasurements(client.event?.measurements);
  });

  it('Stall tracking returns null on a custom endTimestamp that is not near now', async () => {
    startSpanManual({ name: 'Stall will happen during this span' }, (rootSpan: Span | undefined) => {
      rootSpan!.end(timestampInSeconds() - 1);
    });

    await client.flush();

    expect(client.event?.measurements).toBeUndefined();
  });

  it('Stall tracking supports endTimestamp that is from the last span', async () => {
    const rootSpan = startIdleSpan({ name: 'Stall will happen during this span' });
    let childSpanEnd: number | undefined = undefined;
    startSpanManual({ name: 'This is a child of the active span' }, (childSpan: Span | undefined) => {
      childSpanEnd = timestampInSeconds();
      childSpan!.end(childSpanEnd);
      jest.runOnlyPendingTimers();
    });
    jest.runOnlyPendingTimers();
    rootSpan!.end(childSpanEnd);

    await client.flush();

    expectStallMeasurements(client.event?.measurements);
  });

  it('Stall tracking rejects custom endTimestamp that is far from now and not equal to the last child end', async () => {
    const rootSpan = startIdleSpan({ name: 'Stall will happen during this span' });
    let childSpanEnd: number | undefined = undefined;
    startSpanManual({ name: 'This is a child of the active span' }, (childSpan: Span | undefined) => {
      childSpanEnd = timestampInSeconds() + 10;
      childSpan!.end(childSpanEnd);
      jest.runOnlyPendingTimers();
    });
    jest.runOnlyPendingTimers();
    rootSpan!.end(childSpanEnd! + 20);

    await client.flush();

    expect(client.event?.measurements).toBeUndefined();
  });

  it('Stall tracking ignores unfinished spans in normal transactions', async () => {
    startSpan({ name: 'Stall will happen during this span' }, () => {
      startSpan({ name: 'This child span will finish' }, () => {
        jest.runOnlyPendingTimers();
      });
      startSpanManual({ name: 'This child span never finishes' }, () => {
        jest.runOnlyPendingTimers();
      });
      jest.runOnlyPendingTimers();
    });

    await client.flush();

    expectStallMeasurements(client.event?.measurements);
  });

  it('Stall tracking only measures stalls inside the final time when end is trimmed', async () => {
    startIdleSpan({ name: 'Stall will happen during this span' });

    startSpan({ name: 'This is a child of the active span' }, () => {
      expensiveOperation();
    });

    jest.runOnlyPendingTimers(); // This allows the child span end to be processed
    expensiveOperation(); // This should not be recorded
    jest.runAllTimers(); // This should finish the root span

    await client.flush();

    const measurements = client.event?.measurements;
    expectNonZeroStallMeasurements(measurements);
    expect(measurements?.stall_count.value).toEqual(1);
  });

  it('Stall tracking does not track the first transaction if more than 10 are running', async () => {
    // new `startSpan` API doesn't allow creation of multiple transactions
    new Array(11)
      .fill(undefined)
      .map((_, i) => {
        return startSpanManual({ name: `Test Transaction ${i}`, forceTransaction: true }, span => span);
      })
      .forEach(t => {
        t.end();
      });

    await client.flush();

    expect(client.eventQueue[0].measurements).toBeUndefined();
  });
});
