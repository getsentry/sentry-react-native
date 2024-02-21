import type { TransactionEvent } from '@sentry/types';

describe('React Navigation - TTID', () => {
  test('should add ttid span', () => {
    navigateToNewScreen();

    const transaction = getCreatedTransaction();

    expect(transaction).toEqual(expect.objectContaining(expect.objectContaining(<TransactionEvent> {
      measurements: expect.objectContaining({
        // ...
      }),
      spans: expect.arrayContaining([
        expect.objectContaining({
          op: 'navigation',
          description: 'Navigate to New Screen',
          startTimestamp: expect.any(Number),
          endTimestamp: expect.any(Number),
          parentSpanId: expect.any(String),
          traceId: expect.any(String),
          spanId: expect.any(String),
          data: expect.objectContaining({
            screen: 'New Screen',
          }),
        }),
      ]),
    })));
  });

  test('should add processing navigation span', () => {
    navigateToNewScreen();

    const transaction = getCreatedTransaction();

    expect(transaction).toEqual(expect.objectContaining(expect.objectContaining(<TransactionEvent> {
      measurements: expect.objectContaining({
        // ...
      }),
      spans: expect.arrayContaining([
        expect.objectContaining({
          op: 'navigation',
          description: 'Navigate to New Screen',
          startTimestamp: expect.any(Number),
          endTimestamp: expect.any(Number),
          parentSpanId: expect.any(String),
          traceId: expect.any(String),
          spanId: expect.any(String),
          data: expect.objectContaining({
            screen: 'New Screen',
          }),
        }),
      ]),
    })));
  });

  test('should add ttid span for application start up', () => {
    createStartUpNavigation();
  });

  test('should add canceled ttid span when exceeding ttid timeout', () => {
    navigateToNewScreenWithNeverEndingTTID();
  });

  test('should add canceled ttid span when exceeding idle final timeout', () => {
    navigateToNewScreenWithNeverEndingTTID();
  });

  test('should add canceled ttid span when finished by heartbeat', () => {
    navigateToNewScreenWithNeverEndingTTID();
  });

  function createStartUpNavigation() {
    // ...
  }

  function navigateToNewScreen() {
    // ...
  }

  function navigateToNewScreenWithNeverEndingTTID() {
    // ...
  }

  function getCreatedTransaction(): TransactionEvent {
    return {
      type: 'transaction',
    };
  }
});
