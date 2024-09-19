import { logger } from '@sentry/utils';
import { DeviceEventEmitter } from 'react-native';
import * as RN from 'react-native';

import type { Spec } from '../../src/js/NativeRNSentryTimeToDisplay';
import { NewFrameEventName } from '../../src/js/utils/sentryeventemitter';
import { createSentryFallbackEventEmitter } from '../../src/js/utils/sentryeventemitterfallback';

// Mock dependencies
jest.mock('react-native', () => {
  const RNSentryTimeToDisplay: Spec = {
    requestAnimationFrame: jest.fn(() => Promise.resolve(12345)),
    isAvailable: () => true,
  };
  return {
    DeviceEventEmitter: {
      addListener: jest.fn(),
      emit: jest.fn(),
    },
    NativeModules: {
      RNSentryTimeToDisplay,
    },
    Platform: {
      OS: 'ios',
    },
  };
});

const RNSentryTimeToDisplay = RN.NativeModules.RNSentryTimeToDisplay as Spec;

jest.mock('../../src/js/utils/environment', () => ({
  isTurboModuleEnabled: () => false,
}));

jest.mock('../../src/js/wrapper', () => jest.requireActual('../mockWrapper'));

jest.mock('@sentry/utils', () => ({
  logger: {
    log: jest.fn(),
    error: jest.fn(),
  },
}));

describe('SentryEventEmitterFallback', () => {
  let emitter: ReturnType<typeof createSentryFallbackEventEmitter>;

  beforeEach(() => {
    jest.clearAllMocks();
    // @ts-expect-error test
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => cb());
    emitter = createSentryFallbackEventEmitter();
  });

  afterEach(() => {
    // @ts-expect-error test
    window.requestAnimationFrame.mockRestore();
    RNSentryTimeToDisplay.isAvailable = () => true;
  });

  it('should initialize and add a listener', () => {
    emitter.initAsync();

    expect(DeviceEventEmitter.addListener).toHaveBeenCalledWith(NewFrameEventName, expect.any(Function));
  });

  it('should start listener and use fallback when native call returned a value', async () => {
    const fallbackTime = Date.now() / 1000;

    jest.useFakeTimers();

    (RNSentryTimeToDisplay.requestAnimationFrame as jest.Mock).mockResolvedValueOnce(fallbackTime);

    const animation = RNSentryTimeToDisplay.requestAnimationFrame as jest.Mock;

    emitter.startListenerAsync();
    await animation; // wait for the Native execution to be completed.

    await expect(RNSentryTimeToDisplay.requestAnimationFrame).toHaveBeenCalled();

    // Simulate retries and timer
    jest.runAllTimers();

    // Ensure fallback event is emitted
    expect(DeviceEventEmitter.emit).toHaveBeenCalledWith(NewFrameEventName, {
      newFrameTimestampInSeconds: fallbackTime,
      isFallback: true,
    });
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('[Sentry] Native event emitter did not reply in time. Using Native fallback emitter.'),
    );
  });

  it('should start listener and use fallback when native call fails', async () => {
    jest.useFakeTimers();
    const fallbackTime = Date.now() / 1000;

    const animation = RNSentryTimeToDisplay.requestAnimationFrame as jest.Mock;
    animation.mockRejectedValueOnce(new Error('Failed'));

    emitter.startListenerAsync();
    await animation; // wait for the Native execution to be completed.

    await expect(RNSentryTimeToDisplay.requestAnimationFrame).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith('Failed to recceive Native fallback timestamp.', expect.any(Error));

    // Simulate retries and timer
    jest.runAllTimers();

    // Ensure fallback event is emitted
    expect(DeviceEventEmitter.emit).toHaveBeenCalledWith(NewFrameEventName, {
      newFrameTimestampInSeconds: fallbackTime,
      isFallback: true,
    });
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining(
        '[Sentry] Native event emitter did not reply in time. Using JavaScript fallback emitter.',
      ),
    );
  });

  it('should start listener and use fallback when native call is not available', async () => {
    jest.useFakeTimers();
    const fallbackTime = Date.now() / 1000;

    RNSentryTimeToDisplay.isAvailable = () => false;
    const animation = RNSentryTimeToDisplay.requestAnimationFrame as jest.Mock;

    emitter.startListenerAsync();
    await animation; // wait for the Native execution to be completed.

    // Simulate retries and timer
    jest.runAllTimers();

    // Ensure fallback event is emitted
    expect(DeviceEventEmitter.emit).toHaveBeenCalledWith(NewFrameEventName, {
      newFrameTimestampInSeconds: fallbackTime,
      isFallback: true,
    });
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining(
        '[Sentry] Native event emitter did not reply in time. Using JavaScript fallback emitter.',
      ),
    );
  });


  it('should start listener and call native when native module is available', async () => {
    const nativeTimestamp = 12345;

    (RNSentryTimeToDisplay.requestAnimationFrame as jest.Mock).mockResolvedValueOnce(nativeTimestamp);

    emitter.startListenerAsync();

    expect(RNSentryTimeToDisplay.requestAnimationFrame).toHaveBeenCalled();
  });

  it('should not emit if original event emitter was called', async () => {
    jest.useFakeTimers();

    const animation = RNSentryTimeToDisplay.requestAnimationFrame as jest.Mock;

    const mockAddListener = jest.fn();
    DeviceEventEmitter.addListener = mockAddListener;

    // Capture the callback passed to addListener
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/ban-types
    let callback: Function = () => {};
    mockAddListener.mockImplementationOnce((eventName, cb) => {
      if (eventName === NewFrameEventName) {
        callback = cb;
      }
      return {
        remove: jest.fn(),
      };
    });

    emitter.initAsync();
    emitter.startListenerAsync();
    callback();

    await animation; // wait for the Native execution to be completed.

    // Simulate retries and timer
    jest.runAllTimers();

    expect(DeviceEventEmitter.emit).not.toBeCalled();
    expect(logger.log).not.toBeCalled();
  });

  it('should retry up to maxRetries and emit fallback if no response', async () => {
    jest.useFakeTimers();

    const animation = RNSentryTimeToDisplay.requestAnimationFrame as jest.Mock;
    emitter.startListenerAsync();
    await animation; // wait for the Native execution to be completed.

    expect(logger.log).not.toHaveBeenCalled();

    // Simulate retries and timer
    jest.runAllTimers();

    expect(DeviceEventEmitter.emit).toHaveBeenCalledWith(
      NewFrameEventName,
      expect.objectContaining({ isFallback: true }),
    );
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('Native event emitter did not reply in time'));

    jest.useRealTimers();
  });

  it('should remove subscription when closeAll is called', () => {
    const mockRemove = jest.fn();
    (DeviceEventEmitter.addListener as jest.Mock).mockReturnValue({ remove: mockRemove });

    emitter.initAsync();
    emitter.closeAll();

    expect(mockRemove).toHaveBeenCalled();
  });
});
