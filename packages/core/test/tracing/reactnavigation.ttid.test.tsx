import type { Scope, Span, SpanJSON, TransactionEvent, Transport } from '@sentry/types';
import { timestampInSeconds } from '@sentry/utils';
import * as TestRenderer from '@testing-library/react-native'
import * as React from "react";

import * as mockWrapper from '../mockWrapper';
import * as mockedSentryEventEmitter from '../utils/mockedSentryeventemitterfallback';
import * as mockedtimetodisplaynative from './mockedtimetodisplaynative';
jest.mock('../../src/js/wrapper', () => mockWrapper);
jest.mock('../../src/js/utils/environment');
jest.mock('../../src/js/utils/sentryeventemitterfallback', () => mockedSentryEventEmitter);
jest.mock('../../src/js/tracing/timetodisplaynative', () => mockedtimetodisplaynative);

import * as Sentry from '../../src/js';
import { startSpanManual } from '../../src/js';
import { TimeToFullDisplay, TimeToInitialDisplay } from '../../src/js/tracing';
import { _setAppStartEndTimestampMs } from '../../src/js/tracing/integrations/appStart';
import { SPAN_ORIGIN_AUTO_NAVIGATION_REACT_NAVIGATION, SPAN_ORIGIN_AUTO_UI_TIME_TO_DISPLAY, SPAN_ORIGIN_MANUAL_UI_TIME_TO_DISPLAY } from '../../src/js/tracing/origin';
import { isHermesEnabled, notWeb } from '../../src/js/utils/environment';
import { createSentryFallbackEventEmitter } from '../../src/js/utils/sentryeventemitterfallback';
import { RN_GLOBAL_OBJ } from '../../src/js/utils/worldwide';
import { MOCK_DSN } from '../mockDsn';
import { secondInFutureTimestampMs } from '../testutils';
import type { MockedSentryEventEmitterFallback } from '../utils/mockedSentryeventemitterfallback';
import { emitNativeFullDisplayEvent, emitNativeInitialDisplayEvent } from './mockedtimetodisplaynative';
import { createMockNavigationAndAttachTo } from './reactnavigationutils';

const SCOPE_SPAN_FIELD = '_sentrySpan';

type ScopeWithMaybeSpan = Scope & {
  [SCOPE_SPAN_FIELD]?: Span;
};

describe('React Navigation - TTID', () => {
  let mockedEventEmitter: MockedSentryEventEmitterFallback;
  let transportSendMock: jest.Mock<ReturnType<Transport['send']>, Parameters<Transport['send']>>;
  let mockedNavigation: ReturnType<typeof createMockNavigationAndAttachTo>;
  const mockedAppStartTimeSeconds: number = timestampInSeconds();

  describe('ttid enabled', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      (notWeb as jest.Mock).mockReturnValue(true);
      (isHermesEnabled as jest.Mock).mockReturnValue(true);

      mockWrapper.NATIVE.fetchNativeAppStart.mockResolvedValue({
        app_start_timestamp_ms: mockedAppStartTimeSeconds * 1000,
        has_fetched: false,
        type: 'cold',
        spans: [],
      });
      _setAppStartEndTimestampMs(mockedAppStartTimeSeconds * 1000);

      mockedEventEmitter = mockedSentryEventEmitter.createMockedSentryFallbackEventEmitter();
      (createSentryFallbackEventEmitter as jest.Mock).mockReturnValue(mockedEventEmitter);

      const sut = createTestedInstrumentation({ enableTimeToInitialDisplay: true });
      transportSendMock = initSentry(sut).transportSendMock;

      mockedNavigation = createMockNavigationAndAttachTo(sut);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('should add ttid span', () => {
      jest.runOnlyPendingTimers(); // Flush app start transaction

      mockedNavigation.navigateToNewScreen();
      mockedEventEmitter.emitNewFrameEvent();
      jest.runOnlyPendingTimers(); // Flush ttid transaction

      const transaction = getLastTransaction(transportSendMock);
      expect(transaction).toEqual(
        expect.objectContaining<TransactionEvent>({
          type: 'transaction',
          spans: expect.arrayContaining([
            expect.objectContaining<Partial<SpanJSON>>({
              data: {
                'sentry.op': 'ui.load.initial_display',
                'sentry.origin': SPAN_ORIGIN_AUTO_UI_TIME_TO_DISPLAY,
              },
              description: 'New Screen initial display',
              op: 'ui.load.initial_display',
              origin: SPAN_ORIGIN_AUTO_UI_TIME_TO_DISPLAY,
              status: 'ok',
              start_timestamp: transaction.start_timestamp,
              timestamp: expect.any(Number),
            }),
          ]),
        }),
      );
    });

    test('should end ttid with measurements even when active span was removed from the scope', () => {
      jest.runOnlyPendingTimers(); // Flush app start transaction

      mockedNavigation.navigateToNewScreen();
      (Sentry.getCurrentScope() as ScopeWithMaybeSpan)[SCOPE_SPAN_FIELD] = undefined;
      mockedEventEmitter.emitNewFrameEvent();
      jest.runOnlyPendingTimers(); // Flush transaction

      const transaction = getLastTransaction(transportSendMock);
      expect(transaction).toEqual(
        expect.objectContaining<TransactionEvent>({
          type: 'transaction',
          spans: expect.arrayContaining([
            expect.objectContaining<Partial<SpanJSON>>({
              data: {
                'sentry.op': 'ui.load.initial_display',
                'sentry.origin': SPAN_ORIGIN_AUTO_UI_TIME_TO_DISPLAY,
              },
              description: 'New Screen initial display',
              op: 'ui.load.initial_display',
              origin: SPAN_ORIGIN_AUTO_UI_TIME_TO_DISPLAY,
              status: 'ok',
              start_timestamp: transaction.start_timestamp,
              timestamp: expect.any(Number),
            }),
          ]),
          measurements: expect.objectContaining<Required<TransactionEvent>['measurements']>({
            time_to_initial_display: {
              value: expect.any(Number),
              unit: 'millisecond',
            },
          }),
        }),
      );
    });

    test('should end ttid with measurements even when active span on the scope changed', () => {
      jest.runOnlyPendingTimers(); // Flush app start transaction

      mockedNavigation.navigateToNewScreen();
      (Sentry.getCurrentScope() as ScopeWithMaybeSpan)[SCOPE_SPAN_FIELD] = startSpanManual({ name: 'test' }, s => s);
      mockedEventEmitter.emitNewFrameEvent();
      jest.runOnlyPendingTimers(); // Flush transaction

      const transaction = getLastTransaction(transportSendMock);
      expect(transaction).toEqual(
        expect.objectContaining<TransactionEvent>({
          type: 'transaction',
          spans: expect.arrayContaining([
            expect.objectContaining<Partial<SpanJSON>>({
              data: {
                'sentry.op': 'ui.load.initial_display',
                'sentry.origin': SPAN_ORIGIN_AUTO_UI_TIME_TO_DISPLAY,
              },
              description: 'New Screen initial display',
              op: 'ui.load.initial_display',
              origin: SPAN_ORIGIN_AUTO_UI_TIME_TO_DISPLAY,
              status: 'ok',
              start_timestamp: transaction.start_timestamp,
              timestamp: expect.any(Number),
            }),
          ]),
          measurements: expect.objectContaining<Required<TransactionEvent>['measurements']>({
            time_to_initial_display: {
              value: expect.any(Number),
              unit: 'millisecond',
            },
          }),
        }),
      );
    });

    test('should add ttid measurement', () => {
      jest.runOnlyPendingTimers(); // Flush app start transaction

      mockedNavigation.navigateToNewScreen();
      mockedEventEmitter.emitNewFrameEvent();
      jest.runOnlyPendingTimers(); // Flush ttid transaction

      const transaction = getLastTransaction(transportSendMock);
      expect(transaction).toEqual(
        expect.objectContaining<TransactionEvent>({
          type: 'transaction',
          measurements: expect.objectContaining<Required<TransactionEvent>['measurements']>({
            time_to_initial_display: {
              value: expect.any(Number),
              unit: 'millisecond',
            },
          }),
        }),
      );
    });

    test('should add processing navigation span', () => {
      jest.runOnlyPendingTimers(); // Flush app start transaction

      mockedNavigation.navigateToNewScreen();
      mockedEventEmitter.emitNewFrameEvent();
      jest.runOnlyPendingTimers(); // Flush ttid transaction

      const transaction = getLastTransaction(transportSendMock);
      expect(transaction).toEqual(
        expect.objectContaining<TransactionEvent>({
          type: 'transaction',
          spans: expect.arrayContaining([
            expect.objectContaining<Partial<SpanJSON>>({
              data: {
                'sentry.op': 'navigation.processing',
                'sentry.origin': SPAN_ORIGIN_AUTO_NAVIGATION_REACT_NAVIGATION,
              },
              description: 'Processing navigation to New Screen',
              op: 'navigation.processing',
              origin: SPAN_ORIGIN_AUTO_NAVIGATION_REACT_NAVIGATION,
              status: 'ok',
              start_timestamp: transaction.start_timestamp,
              timestamp: expect.any(Number),
            }),
          ]),
        }),
      );
    });

    test('should add processing navigation span for application start up', () => {
      mockedNavigation.finishAppStartNavigation();
      mockedEventEmitter.emitNewFrameEvent();
      jest.runOnlyPendingTimers(); // Flush ttid transaction

      const transaction = getLastTransaction(transportSendMock);
      expect(transaction).toEqual(
        expect.objectContaining<TransactionEvent>({
          type: 'transaction',
          spans: expect.arrayContaining([
            expect.objectContaining<Partial<SpanJSON>>({
              data: {
                'sentry.op': 'navigation.processing',
                'sentry.origin': SPAN_ORIGIN_AUTO_NAVIGATION_REACT_NAVIGATION,
              },
              description: 'Processing navigation to Initial Screen',
              op: 'navigation.processing',
              origin: SPAN_ORIGIN_AUTO_NAVIGATION_REACT_NAVIGATION,
              status: 'ok',
              start_timestamp: expect.any(Number),
              timestamp: expect.any(Number),
            }),
          ]),
        }),
      );
    });

    test('should add ttid span for application start up', () => {
      mockedNavigation.finishAppStartNavigation();
      mockedEventEmitter.emitNewFrameEvent();
      jest.runOnlyPendingTimers(); // Flush ttid transaction

      const transaction = getLastTransaction(transportSendMock);
      expect(transaction).toEqual(
        expect.objectContaining<TransactionEvent>({
          type: 'transaction',
          spans: expect.arrayContaining([
            expect.objectContaining<Partial<SpanJSON>>({
              description: 'Cold App Start',
            }),
            expect.objectContaining<Partial<SpanJSON>>({
              data: {
                'sentry.op': 'ui.load.initial_display',
                'sentry.origin': SPAN_ORIGIN_AUTO_UI_TIME_TO_DISPLAY,
              },
              description: 'Initial Screen initial display',
              op: 'ui.load.initial_display',
              origin: SPAN_ORIGIN_AUTO_UI_TIME_TO_DISPLAY,
              status: 'ok',
              start_timestamp: mockedAppStartTimeSeconds,
              timestamp: expect.any(Number),
            }),
          ]),
        }),
      );
    });

    test('should add ttfd span for application start up', () => {
      mockedNavigation.finishAppStartNavigation();
      mockedEventEmitter.emitNewFrameEvent();

      TestRenderer.render(<TimeToFullDisplay record />);
      emitNativeFullDisplayEvent();

      jest.runOnlyPendingTimers(); // Flush ttid transaction

      const transaction = getLastTransaction(transportSendMock);
      expect(transaction).toEqual(
        expect.objectContaining<TransactionEvent>({
          type: 'transaction',
          spans: expect.arrayContaining([
            expect.objectContaining<Partial<SpanJSON>>({
              description: 'Cold App Start',
            }),
            expect.objectContaining<Partial<SpanJSON>>({
              data: {
                'sentry.op': 'ui.load.full_display',
                'sentry.origin': SPAN_ORIGIN_MANUAL_UI_TIME_TO_DISPLAY,
              },
              description: 'Time To Full Display',
              op: 'ui.load.full_display',
              origin: SPAN_ORIGIN_MANUAL_UI_TIME_TO_DISPLAY,
              status: 'ok',
              start_timestamp: mockedAppStartTimeSeconds,
              timestamp: expect.any(Number),
            }),
          ]),
        }),
      );
    });

    test('should add ttid measurement for application start up', () => {
      mockedNavigation.finishAppStartNavigation();
      mockedEventEmitter.emitNewFrameEvent();
      jest.runOnlyPendingTimers(); // Flush ttid transaction

      const transaction = getLastTransaction(transportSendMock);
      expect(transaction).toEqual(
        expect.objectContaining<TransactionEvent>({
          type: 'transaction',
          spans: expect.arrayContaining([
            expect.objectContaining<Partial<SpanJSON>>({
              description: 'Cold App Start',
            }),
          ]),
          measurements: expect.objectContaining<Required<TransactionEvent>['measurements']>({
            time_to_initial_display: {
              value: expect.any(Number),
              unit: 'millisecond',
            },
          }),
        }),
      );
    });

    test('ttid span duration and measurement should equal for application start up', () => {
      mockedNavigation.finishAppStartNavigation();
      mockedEventEmitter.emitNewFrameEvent();
      jest.runOnlyPendingTimers(); // Flush ttid transaction

      const transaction = getLastTransaction(transportSendMock);
      expect(getSpanDurationMs(transaction, 'ui.load.initial_display')).toBeDefined();
      expect(transaction.measurements?.time_to_initial_display?.value).toBeDefined();
      expect(getSpanDurationMs(transaction, 'ui.load.initial_display')).toEqual(transaction.measurements?.time_to_initial_display?.value);
    });

    test('ttfd span duration and measurement should equal for application start up', () => {
      mockedNavigation.finishAppStartNavigation();
      mockedEventEmitter.emitNewFrameEvent();

      TestRenderer.render(<TimeToFullDisplay record />);
      emitNativeFullDisplayEvent();

      jest.runOnlyPendingTimers(); // Flush ttid transaction

      const transaction = getLastTransaction(transportSendMock);
      expect(getSpanDurationMs(transaction, 'ui.load.full_display')).toBeDefined();
      expect(transaction.measurements?.time_to_full_display?.value).toBeDefined();
      expect(getSpanDurationMs(transaction, 'ui.load.full_display')).toEqual(transaction.measurements?.time_to_full_display?.value);
    });

    test('idle transaction should cancel the ttid span if new frame not received', () => {
      mockedNavigation.navigateToNewScreen();
      jest.runOnlyPendingTimers(); // Flush ttid transaction

      const transaction = getLastTransaction(transportSendMock);
      expect(transaction).toEqual(
        expect.objectContaining<TransactionEvent>({
          type: 'transaction',
          spans: expect.arrayContaining([
            expect.objectContaining<Partial<SpanJSON>>({
              data: {
                'sentry.op': 'ui.load.initial_display',
                'sentry.origin': SPAN_ORIGIN_AUTO_UI_TIME_TO_DISPLAY,
              },
              description: 'New Screen initial display',
              op: 'ui.load.initial_display',
              origin: SPAN_ORIGIN_AUTO_UI_TIME_TO_DISPLAY,
              status: 'cancelled',
              start_timestamp: transaction.start_timestamp,
              timestamp: expect.any(Number),
            }),
          ]),
        }),
      );
    });

    test('should not sample empty back navigation transactions with navigation processing', () => {
      jest.runOnlyPendingTimers(); // Flush app start transaction

      mockedNavigation.navigateToNewScreen();
      mockedEventEmitter.emitNewFrameEvent();
      jest.runOnlyPendingTimers(); // Flush transaction

      mockedNavigation.navigateToInitialScreen();
      mockedEventEmitter.emitNewFrameEvent();
      jest.runOnlyPendingTimers(); // Flush transaction

      const transaction = getLastTransaction(transportSendMock);
      expect(transaction).toEqual(
        expect.objectContaining<TransactionEvent>({
          type: 'transaction',
          transaction: 'New Screen',
        }),
      );
    });

    test('should not add ttid span and measurement back navigation transactions', () => {
      jest.runOnlyPendingTimers(); // Flush app start transaction

      mockedNavigation.navigateToNewScreen();
      mockedEventEmitter.emitNewFrameEvent();
      jest.runOnlyPendingTimers(); // Flush transaction

      mockedNavigation.navigateToInitialScreen();
      mockedEventEmitter.emitNewFrameEvent();
      const artificialSpan = Sentry.startInactiveSpan({
        name: 'Artificial span to ensure back navigation transaction is not empty',
      });
      artificialSpan?.end();
      jest.runOnlyPendingTimers(); // Flush transaction

      const transaction = getLastTransaction(transportSendMock);
      expect(transaction).toEqual(
        expect.objectContaining<TransactionEvent>({
          type: 'transaction',
          transaction: 'Initial Screen',
          spans: expect.not.arrayContaining([
            expect.objectContaining<Partial<SpanJSON>>({
              op: 'ui.load.initial_display',
            }),
          ]),
        }),
      );
      expect(transaction.measurements).toBeOneOf([
        undefined,
        expect.not.objectContaining<Required<TransactionEvent>['measurements']>({
          time_to_initial_display: expect.any(Object),
        }),
      ]);
    });

    test('manual initial display api overwrites auto instrumentation', () => {
      const manualInitialDisplayEndTimestampMs = secondInFutureTimestampMs();

      jest.runOnlyPendingTimers(); // Flush app start transaction

      mockedNavigation.navigateToNewScreen();
      const timeToDisplayComponent = TestRenderer.render(<TimeToInitialDisplay />);

      mockedEventEmitter.emitNewFrameEvent();
      timeToDisplayComponent.update(<TimeToInitialDisplay record />);
      emitNativeInitialDisplayEvent(manualInitialDisplayEndTimestampMs);

      jest.runOnlyPendingTimers(); // Flush transaction

      const transaction = getLastTransaction(transportSendMock);
      expect(transaction).toEqual(
        expect.objectContaining<TransactionEvent>({
          type: 'transaction',
          transaction: 'New Screen',
          spans: expect.arrayContaining([
            expect.objectContaining<Partial<SpanJSON>>({
              op: 'ui.load.initial_display',
              timestamp: manualInitialDisplayEndTimestampMs / 1_000
            }),
          ]),
          measurements: expect.objectContaining<Required<TransactionEvent>['measurements']>({
            time_to_initial_display: {
              value: expect.any(Number),
              unit: 'millisecond',
            },
          }),
        }),
      );
    });

    test('auto initial display api overwrites manual api if manual not initialized on time', () => {
      const autoInitialDisplayEndTimestampMs = timestampInSeconds();

      jest.runOnlyPendingTimers(); // Flush app start transaction
      mockedNavigation.navigateToNewScreen();
      mockedEventEmitter.emitNewFrameEvent(autoInitialDisplayEndTimestampMs);

      // Initialized too late auto instrumentation finished before manual
      TestRenderer.render(<TimeToInitialDisplay record />);
      emitNativeInitialDisplayEvent(secondInFutureTimestampMs());

      jest.runOnlyPendingTimers(); // Flush transaction

      const transaction = getLastTransaction(transportSendMock);
      expect(transaction).toEqual(
        expect.objectContaining<TransactionEvent>({
          type: 'transaction',
          transaction: 'New Screen',
          spans: expect.arrayContaining([
            expect.objectContaining<Partial<SpanJSON>>({
              op: 'ui.load.initial_display',
              timestamp: autoInitialDisplayEndTimestampMs,
            }),
          ]),
          measurements: expect.objectContaining<Required<TransactionEvent>['measurements']>({
            time_to_initial_display: {
              value: expect.any(Number),
              unit: 'millisecond',
            },
          }),
        }),
      );
    });
  });

  describe('ttid disabled', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      (notWeb as jest.Mock).mockReturnValue(true);
      (isHermesEnabled as jest.Mock).mockReturnValue(true);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it.each([undefined, {}, { enableTimeToInitialDisplay: undefined }, { enableTimeToInitialDisplay: false }])(
      'should not add ttid span with options %s',
      options => {
        const sut = createTestedInstrumentation(options);
        transportSendMock = initSentry(sut).transportSendMock;

        mockedNavigation = createMockNavigationAndAttachTo(sut);

        jest.runOnlyPendingTimers(); // Flush app start transaction
        mockedNavigation.navigateToNewScreen();
        jest.runOnlyPendingTimers(); // Flush navigation transaction

        const transaction = getLastTransaction(transportSendMock);
        expect(transaction).toEqual(
          expect.objectContaining<TransactionEvent>({
            type: 'transaction',
            spans: expect.not.arrayContaining([
              expect.objectContaining<Partial<SpanJSON>>({
                op: 'ui.load.initial_display',
              }),
            ]),
          }),
        );
      },
    );

    test('should not add ttid measurement', () => {
      jest.runOnlyPendingTimers(); // Flush app start transaction
      mockedNavigation.navigateToNewScreen();
      jest.runOnlyPendingTimers(); // Flush navigation transaction

      const transaction = getLastTransaction(transportSendMock);
      expect(transaction.measurements).toBeOneOf([
        undefined,
        expect.not.objectContaining<Required<TransactionEvent>['measurements']>({
          time_to_initial_display: expect.any(Object),
        }),
      ]);
    });

    test('should not add processing navigation span', () => {
      jest.runOnlyPendingTimers(); // Flush app start transaction
      mockedNavigation.navigateToNewScreen();
      jest.runOnlyPendingTimers(); // Flush navigation transaction

      const transaction = getLastTransaction(transportSendMock);
      expect(transaction).toEqual(
        expect.objectContaining<TransactionEvent>({
          type: 'transaction',
          spans: expect.not.arrayContaining([
            expect.objectContaining<Partial<SpanJSON>>({
              op: 'navigation.processing',
            }),
          ]),
        }),
      );
    });
  });

  function getSpanDurationMs(transaction: TransactionEvent, op: string): number | undefined {
    const ttidSpan = transaction.spans?.find(span => span.op === op);
    if (!ttidSpan) {
      return undefined;
    }

    const spanJSON = ttidSpan as unknown as SpanJSON; // the JS SDK typings are not correct
    if (!spanJSON.timestamp || !spanJSON.start_timestamp) {
      return undefined;
    }

    return (spanJSON.timestamp - spanJSON.start_timestamp) * 1000;
  }

  function createTestedInstrumentation(options?: { enableTimeToInitialDisplay?: boolean }) {
    const sut = Sentry.reactNavigationIntegration({
      ...options,
      ignoreEmptyBackNavigationTransactions: true, // default true
    });
    return sut;
  }

  function getLastTransaction(mockedTransportSend: jest.Mock): TransactionEvent {
    // Until https://github.com/getsentry/sentry-javascript/blob/a7097d9ba2a74b2cb323da0ef22988a383782ffb/packages/types/src/event.ts#L93
    return JSON.parse(JSON.stringify(mockedTransportSend.mock.lastCall[0][1][0][1]));
  }
});

function initSentry(sut: ReturnType<typeof Sentry.reactNavigationIntegration>): {
  transportSendMock: jest.Mock<ReturnType<Transport['send']>, Parameters<Transport['send']>>;
} {
  RN_GLOBAL_OBJ.__sentry_rn_v5_registered = false;
  const transportSendMock = jest.fn<ReturnType<Transport['send']>, Parameters<Transport['send']>>();
  const options: Sentry.ReactNativeOptions = {
    dsn: MOCK_DSN,
    enableTracing: true,
    enableStallTracking: false,
    integrations: [
      sut,
      Sentry.reactNativeTracingIntegration(),
    ],
    transport: () => ({
      send: transportSendMock.mockResolvedValue({}),
      flush: jest.fn().mockResolvedValue(true),
    }),
    enableAppStartTracking: true,
  };
  Sentry.init(options);

  return {
    transportSendMock,
  };
}
