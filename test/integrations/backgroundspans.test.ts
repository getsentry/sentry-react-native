import type { Hub as HubClass } from '@sentry/core';
import { IdleTransaction } from '@sentry/core';
import type { Hub, Span } from '@sentry/types';

import { BackgroundSpans } from '../../src/js/integrations';
import { BACKGROUND_SPAN_OP } from '../../src/js/integrations/backgroundspans';
import { MockAppState } from '../mockAppState';

type MockHub = {
  getScope: jest.Mock<{
    getTransaction: jest.Mock;
  }>;
  getClient: jest.Mock;
  captureEvent: jest.Mock;
};

describe('background spans integration', () => {
  let backgroundSpans: BackgroundSpans;
  let mockAppState: MockAppState;
  let mockHub: MockHub;

  beforeEach(() => {
    jest.useFakeTimers();
    mockHub = {
      getScope: jest.fn().mockReturnValue({
        getTransaction: jest.fn(),
      }),
      getClient: jest.fn().mockReturnValue(undefined),
      captureEvent: jest.fn().mockReturnValue('mock-event-id'),
    };
    mockAppState = new MockAppState();
    backgroundSpans = new BackgroundSpans();
    backgroundSpans['_appState'] = mockAppState;
    backgroundSpans.setupOnce(
      () => {},
      () => mockHub as unknown as Hub,
    );
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should create background span before the last spans', () => {
    const transaction: IdleTransaction = mockStartIdleTransaction(mockHub, 10, 20);

    mockAppState.changeState('background');
    jest.advanceTimersByTime(2);
    mockAppState.changeState('active');

    jest.advanceTimersByTime(2);
    const child = transaction.startChild({ op: 'child' });
    jest.advanceTimersByTime(2);
    child.finish();

    transaction.finish();

    jest.runAllTimers();

    const spans: ReturnType<Span['toJSON']>[] | undefined = transaction.spanRecorder?.spans.map((span: Span) =>
      span.toJSON(),
    );
    expect(spans).toEqual(
      expect.arrayContaining(<Span[]>[
        expect.objectContaining<Partial<ReturnType<Span['toJSON']>>>({
          op: 'child',
        }),
        expect.objectContaining<Partial<ReturnType<Span['toJSON']>>>({
          op: BACKGROUND_SPAN_OP,
        }),
      ]),
    );
  });

  test('should keep background span if it is the only span', () => {
    const transaction: IdleTransaction = mockStartIdleTransaction(mockHub, 10, 20);

    mockAppState.changeState('background');
    jest.advanceTimersByTime(2);
    mockAppState.changeState('active');

    transaction.finish();

    jest.runAllTimers();

    const spans: ReturnType<Span['toJSON']>[] | undefined = transaction.spanRecorder?.spans.map((span: Span) =>
      span.toJSON(),
    );
    expect(spans).toEqual(
      expect.arrayContaining(<Span[]>[
        expect.objectContaining<Partial<ReturnType<Span['toJSON']>>>({
          op: BACKGROUND_SPAN_OP,
        }),
      ]),
    );
  });

  test('should remove trailing background span', () => {
    const transaction: IdleTransaction = mockStartIdleTransaction(mockHub, 10, 20);

    const child = transaction.startChild({ op: 'child' });
    jest.advanceTimersByTime(2);
    child.finish();

    mockAppState.changeState('background');
    jest.advanceTimersByTime(2);
    mockAppState.changeState('active');

    mockAppState.changeState('background');
    jest.advanceTimersByTime(2);
    mockAppState.changeState('active');

    transaction.finish();

    jest.runAllTimers();

    const spans: ReturnType<Span['toJSON']>[] | undefined = transaction.spanRecorder?.spans.map((span: Span) =>
      span.toJSON(),
    );
    expect(spans).not.toEqual(
      expect.arrayContaining(<Span[]>[
        expect.objectContaining<Partial<ReturnType<Span['toJSON']>>>({
          op: BACKGROUND_SPAN_OP,
        }),
      ]),
    );
    expect(spans).toEqual(
      expect.arrayContaining(<Span[]>[
        expect.objectContaining<Partial<ReturnType<Span['toJSON']>>>({
          op: 'child',
        }),
      ]),
    );
  });

  test('should keep non trailing background span lasting till the end of transaction', () => {
    const transaction: IdleTransaction = mockStartIdleTransaction(mockHub, 10, 20);

    const child = transaction.startChild({ op: 'child' });
    mockAppState.changeState('background');
    jest.advanceTimersByTime(2);
    mockAppState.changeState('active');
    child.finish();

    transaction.finish();

    jest.runAllTimers();

    const spans: ReturnType<Span['toJSON']>[] | undefined = transaction.spanRecorder?.spans.map((span: Span) =>
      span.toJSON(),
    );
    expect(spans).toEqual(
      expect.arrayContaining(<Span[]>[
        expect.objectContaining<Partial<ReturnType<Span['toJSON']>>>({
          op: 'child',
        }),
        expect.objectContaining<Partial<ReturnType<Span['toJSON']>>>({
          op: BACKGROUND_SPAN_OP,
        }),
      ]),
    );
  });

  test('should record multiple background spans', () => {
    const transaction: IdleTransaction = mockStartIdleTransaction(mockHub, 10, 20);

    mockAppState.changeState('background');
    jest.advanceTimersByTime(2);
    mockAppState.changeState('active');
    jest.advanceTimersByTime(2);
    mockAppState.changeState('background');
    jest.advanceTimersByTime(2);
    mockAppState.changeState('active');
    jest.advanceTimersByTime(2);
    const child = transaction.startChild({ op: 'child' });
    child.finish();
    transaction.finish();

    jest.runAllTimers();

    const spans: ReturnType<Span['toJSON']>[] | undefined = transaction.spanRecorder?.spans.map((span: Span) =>
      span.toJSON(),
    );
    expect(spans?.filter((span: ReturnType<Span['toJSON']>) => span.op === BACKGROUND_SPAN_OP).length).toEqual(2);
  });

  function mockStartIdleTransaction(mockHub: MockHub, idleTimeoutMs: number, finalTimeoutMs: number): IdleTransaction {
    const transaction: IdleTransaction = new IdleTransaction(
      {
        name: 'test-idle-tx-name',
      },
      mockHub as unknown as HubClass,
      idleTimeoutMs,
      finalTimeoutMs,
    );
    transaction.initSpanRecorder(10);

    mockHub.getScope().getTransaction.mockReturnValue(transaction);
    return transaction;
  }
});
