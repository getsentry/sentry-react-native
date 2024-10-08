import type { NewFrameEventName } from '../../src/js/utils/sentryeventemitter';
import { createSentryEventEmitter } from '../../src/js/utils/sentryeventemitter';

describe('Sentry Event Emitter', () => {
  let mockedRemoveListener: jest.Mock;
  let mockedAddListener: jest.Mock;
  let mockedCreateNativeEventEmitter: jest.Mock;

  beforeEach(() => {
    mockedRemoveListener = jest.fn();
    mockedAddListener = jest.fn().mockReturnValue({ remove: mockedRemoveListener });
    mockedCreateNativeEventEmitter = jest.fn().mockReturnValue({ addListener: mockedAddListener });
  });

  test('should create noop emitter if sentry native module is not available', () => {
    const sut = createSentryEventEmitter(undefined, mockedCreateNativeEventEmitter);

    expect(sut).toBeDefined();
    expect(mockedCreateNativeEventEmitter).not.toBeCalled();
  });

  test('should add listener to the native event emitter when initialized', () => {
    const sut = createSentryEventEmitter({} as any, mockedCreateNativeEventEmitter);

    sut.initAsync('rn_sentry_new_frame');

    expect(mockedCreateNativeEventEmitter).toBeCalledTimes(1);
    expect(mockedAddListener).toBeCalledWith('rn_sentry_new_frame', expect.any(Function));
  });

  test('should not add listener to the native event emitter when initialized if already initialized', () => {
    const sut = createSentryEventEmitter({} as any, mockedCreateNativeEventEmitter);

    sut.initAsync('rn_sentry_new_frame');
    sut.initAsync('rn_sentry_new_frame');

    expect(mockedCreateNativeEventEmitter).toBeCalledTimes(1);
    expect(mockedAddListener).toBeCalledTimes(1);
  });

  test('should remove all native listeners when closed', () => {
    const sut = createSentryEventEmitter({} as any, mockedCreateNativeEventEmitter);

    sut.initAsync('rn_sentry_new_frame');
    sut.initAsync('test_event' as NewFrameEventName);
    sut.closeAllAsync();

    expect(mockedRemoveListener).toBeCalledTimes(2);
  });

  test('should call added listeners when native event is emitted', () => {
    const sut = createSentryEventEmitter({} as any, mockedCreateNativeEventEmitter);

    const listener = jest.fn();
    sut.initAsync('rn_sentry_new_frame');
    sut.addListener('rn_sentry_new_frame', listener);

    const nativeListener = mockedAddListener.mock.calls[0][1];
    nativeListener({ type: 'rn_sentry_new_frame' });

    expect(listener).toBeCalledTimes(1);
  });

  test('should not call removed listeners when native event is emitted', () => {
    const sut = createSentryEventEmitter({} as any, mockedCreateNativeEventEmitter);

    const listener = jest.fn();
    sut.initAsync('rn_sentry_new_frame');
    sut.addListener('rn_sentry_new_frame', listener);
    sut.removeListener('rn_sentry_new_frame', listener);

    const nativeListener = mockedAddListener.mock.calls[0][1];
    nativeListener({ type: 'rn_sentry_new_frame' });

    expect(listener).not.toBeCalled();
  });

  test('should call once listeners only once when native event is emitted', () => {
    const sut = createSentryEventEmitter({} as any, mockedCreateNativeEventEmitter);

    const listener = jest.fn();
    sut.initAsync('rn_sentry_new_frame');
    sut.once('rn_sentry_new_frame', listener);

    const nativeListener = mockedAddListener.mock.calls[0][1];
    nativeListener({ type: 'rn_sentry_new_frame' });
    nativeListener({ type: 'rn_sentry_new_frame' });

    expect(listener).toBeCalledTimes(1);
  });
});
