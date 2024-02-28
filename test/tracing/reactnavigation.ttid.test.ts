import * as mockWrapper from '../mockWrapper';
import * as mockedSentryEventEmitter from '../utils/mockedSentryeventemitter';
jest.mock('../../src/js/wrapper', () => mockWrapper);
jest.mock('../../src/js/utils/environment');
jest.mock('../../src/js/utils/sentryeventemitter', () => mockedSentryEventEmitter);

import type { SpanJSON, TransactionEvent, Transport } from '@sentry/types';
import { timestampInSeconds } from '@sentry/utils';

import * as Sentry from '../../src/js';
import { ReactNavigationInstrumentation } from '../../src/js';
import type { NavigationRoute } from '../../src/js/tracing/reactnavigation';
import { isHermesEnabled, notWeb } from '../../src/js/utils/environment';
import { createSentryEventEmitter } from '../../src/js/utils/sentryeventemitter';
import { RN_GLOBAL_OBJ } from '../../src/js/utils/worldwide';
import { MOCK_DSN } from '../mockDsn';
import type { MockedSentryEventEmitter } from '../utils/mockedSentryeventemitter';

describe('React Navigation - TTID', () => {
  let mockedEventEmitter: MockedSentryEventEmitter;
  let transportSendMock: jest.Mock<ReturnType<Transport['send']>, Parameters<Transport['send']>>;
  let mockedNavigation: ReturnType<typeof createMockNavigationAndAttachTo>;
  const mockedAppStartTimeSeconds: number = timestampInSeconds();

  describe('ttid enabled', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      (notWeb as jest.Mock).mockReturnValue(true);
      (isHermesEnabled as jest.Mock).mockReturnValue(true);

      mockWrapper.NATIVE.fetchNativeAppStart.mockResolvedValue({
        appStartTime: mockedAppStartTimeSeconds * 1000,
        didFetchAppStart: false,
        isColdStart: true,
      });

      mockedEventEmitter = mockedSentryEventEmitter.createMockedSentryEventEmitter();
      (createSentryEventEmitter as jest.Mock).mockReturnValue(mockedEventEmitter);

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

      const transaction = getTransaction(transportSendMock);
      expect(transaction).toEqual(
        expect.objectContaining<TransactionEvent>({
          type: 'transaction',
          spans: expect.arrayContaining([
            expect.objectContaining<Partial<SpanJSON>>({
              data: {
                'sentry.op': 'ui.load.initial_display',
                'sentry.origin': 'manual',
              },
              description: 'New Screen initial display',
              op: 'ui.load.initial_display',
              origin: 'manual',
              status: 'ok',
              start_timestamp: transaction.start_timestamp,
              timestamp: expect.any(Number),
            }),
          ]),
        }),
      );
    });

    test('should add ttid measurement', () => {
      jest.runOnlyPendingTimers(); // Flush app start transaction

      mockedNavigation.navigateToNewScreen();
      mockedEventEmitter.emitNewFrameEvent();
      jest.runOnlyPendingTimers(); // Flush ttid transaction

      const transaction = getTransaction(transportSendMock);
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

      const transaction = getTransaction(transportSendMock);
      expect(transaction).toEqual(
        expect.objectContaining<TransactionEvent>({
          type: 'transaction',
          spans: expect.arrayContaining([
            expect.objectContaining<Partial<SpanJSON>>({
              data: {
                'sentry.op': 'navigation.processing',
                'sentry.origin': 'manual',
              },
              description: 'Processing navigation to New Screen',
              op: 'navigation.processing',
              origin: 'manual',
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

      const transaction = getTransaction(transportSendMock);
      expect(transaction).toEqual(
        expect.objectContaining<TransactionEvent>({
          type: 'transaction',
          spans: expect.arrayContaining([
            expect.objectContaining<Partial<SpanJSON>>({
              data: {
                'sentry.op': 'navigation.processing',
                'sentry.origin': 'manual',
              },
              description: 'Processing navigation to Initial Screen',
              op: 'navigation.processing',
              origin: 'manual',
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

      const transaction = getTransaction(transportSendMock);
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
                'sentry.origin': 'manual',
              },
              description: 'Initial Screen initial display',
              op: 'ui.load.initial_display',
              origin: 'manual',
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

      const transaction = getTransaction(transportSendMock);
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

    test('idle transaction should cancel the ttid span if new frame not received', () => {
      mockedNavigation.navigateToNewScreen();
      jest.runOnlyPendingTimers(); // Flush ttid transaction

      const transaction = getTransaction(transportSendMock);
      expect(transaction).toEqual(
        expect.objectContaining<TransactionEvent>({
          type: 'transaction',
          spans: expect.arrayContaining([
            expect.objectContaining<Partial<SpanJSON>>({
              data: {
                'sentry.op': 'ui.load.initial_display',
                'sentry.origin': 'manual',
              },
              description: 'New Screen initial display',
              op: 'ui.load.initial_display',
              origin: 'manual',
              status: 'cancelled',
              start_timestamp: transaction.start_timestamp,
              timestamp: expect.any(Number),
            }),
          ]),
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

    it.each([
      undefined,
      {},
      { enableTimeToInitialDisplay: undefined },
      { enableTimeToInitialDisplay: false },
    ])('should not add ttid span with options %s', (options) => {
      const sut = createTestedInstrumentation(options);
      transportSendMock = initSentry(sut).transportSendMock;

      mockedNavigation = createMockNavigationAndAttachTo(sut);

      jest.runOnlyPendingTimers(); // Flush app start transaction
      mockedNavigation.navigateToNewScreen();
      jest.runOnlyPendingTimers(); // Flush navigation transaction

      const transaction = getTransaction(transportSendMock);
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
    });

    test('should not add ttid measurement', () => {
      jest.runOnlyPendingTimers(); // Flush app start transaction
      mockedNavigation.navigateToNewScreen();
      jest.runOnlyPendingTimers(); // Flush navigation transaction

      const transaction = getTransaction(transportSendMock);
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

      const transaction = getTransaction(transportSendMock);
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

  function createTestedInstrumentation(options?: { enableTimeToInitialDisplay?: boolean }) {
    const sut = new ReactNavigationInstrumentation(options);
    return sut;
  }

  function createMockNavigationAndAttachTo(sut: ReactNavigationInstrumentation) {
    const mockedNavigationContained = mockNavigationContainer();
    const mockedNavigation = {
      navigateToNewScreen: () => {
        mockedNavigationContained.listeners['__unsafe_action__']({
          // this object is not used by the instrumentation
        });
        mockedNavigationContained.currentRoute = {
          key: 'new_screen',
          name: 'New Screen',
        };
        mockedNavigationContained.listeners['state']({
          // this object is not used by the instrumentation
        });
      },
      finishAppStartNavigation: () => {
        mockedNavigationContained.currentRoute = {
          key: 'initial_screen',
          name: 'Initial Screen',
        };
        mockedNavigationContained.listeners['state']({
          // this object is not used by the instrumentation
        });
      },
    };
    sut.registerNavigationContainer(mockRef(mockedNavigationContained));

    return mockedNavigation;
  }

  function mockNavigationContainer(): MockNavigationContainer {
    return new MockNavigationContainer();
  }

  function mockRef<T>(wat: T): { current: T } {
    return {
      current: wat,
    };
  }

  function getTransaction(mockedTransportSend: jest.Mock): TransactionEvent {
    // Until https://github.com/getsentry/sentry-javascript/blob/a7097d9ba2a74b2cb323da0ef22988a383782ffb/packages/types/src/event.ts#L93
    return JSON.parse(JSON.stringify(mockedTransportSend.mock.lastCall[0][1][0][1]));
  }
});

class MockNavigationContainer {
  currentRoute: NavigationRoute = {
    key: 'initial_screen',
    name: 'Initial Screen',
  };
  listeners: Record<string, (e: any) => void> = {};
  addListener: any = jest.fn((eventType: string, listener: (e: any) => void): void => {
    this.listeners[eventType] = listener;
  });
  getCurrentRoute(): NavigationRoute | undefined {
    return this.currentRoute;
  }
}

function initSentry(sut: ReactNavigationInstrumentation): {
  transportSendMock: jest.Mock<ReturnType<Transport['send']>, Parameters<Transport['send']>>;
} {
  RN_GLOBAL_OBJ.__sentry_rn_v5_registered = false;
  const transportSendMock = jest.fn<ReturnType<Transport['send']>, Parameters<Transport['send']>>();
  const options: Sentry.ReactNativeOptions = {
    dsn: MOCK_DSN,
    enableTracing: true,
    integrations: [
      new Sentry.ReactNativeTracing({
        routingInstrumentation: sut,
        enableStallTracking: false,
      }),
    ],
    transport: () => ({
      send: transportSendMock.mockResolvedValue(undefined),
      flush: jest.fn().mockResolvedValue(true),
    }),
  };
  Sentry.init(options);

  // In production integrations are setup only once, but in the tests we want them to setup on every init
  const integrations = Sentry.getCurrentHub().getClient()?.getOptions().integrations;
  if (integrations) {
    for (const integration of integrations) {
      integration.setupOnce(Sentry.addGlobalEventProcessor, Sentry.getCurrentHub);
    }
  }

  return {
    transportSendMock,
  };
}
