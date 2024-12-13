import { logger } from '@sentry/core';

import { NewFrameEventName } from '../../src/js/utils/sentryeventemitter';
import { createSentryFallbackEventEmitter } from '../../src/js/utils/sentryeventemitterfallback';

// Mock dependencies
jest.mock('../../src/js/utils/environment', () => ({
  isTurboModuleEnabled: () => false,
}));

jest.mock('../../src/js/wrapper', () => jest.requireActual('../mockWrapper'));

import { NATIVE } from '../../src/js/wrapper';

jest.spyOn(logger, 'warn');
jest.spyOn(logger, 'log');
jest.spyOn(logger, 'error');

describe('SentryEventEmitterFallback', () => {
  let emitter: ReturnType<typeof createSentryFallbackEventEmitter>;

  beforeEach(() => {
    jest.clearAllMocks();
    // @ts-expect-error test
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => cb());
    emitter = createSentryFallbackEventEmitter();
    NATIVE.getNewScreenTimeToDisplay = jest.fn(() => Promise.resolve(12345));
  });

  afterEach(() => {
    // @ts-expect-error test
    window.requestAnimationFrame.mockRestore();
    NATIVE.getNewScreenTimeToDisplay = jest.fn();
  });

  it('should start listener and use fallback when native call returned undefined/null', async () => {
    jest.useFakeTimers();
    const spy = jest.spyOn(require('@sentry/core'), 'timestampInSeconds');
    const fallbackTime = Date.now() / 1000;
    spy.mockReturnValue(fallbackTime);

    (NATIVE.getNewScreenTimeToDisplay as jest.Mock).mockReturnValue(Promise.resolve());

    const listener = jest.fn();
    emitter.onceNewFrame(listener);

    // Wait for the next event loop to allow startListenerAsync to call NATIVE.getNewScreenTimeToDisplay
    await Promise.resolve();

    await expect(NATIVE.getNewScreenTimeToDisplay).toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalledWith('Failed to receive Native fallback timestamp.', expect.any(Error));

    // Simulate retries and timer
    jest.runAllTimers();

    // Ensure fallback event is emitted
    expect(listener).toHaveBeenCalledWith({
      newFrameTimestampInSeconds: fallbackTime,
      isFallback: true,
    });
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining(
        '[Sentry] Native event emitter did not reply in time. Using JavaScript fallback emitter.',
      ),
    );
  });

  it('should start listener and use fallback when native call fails', async () => {
    jest.useFakeTimers();

    (NATIVE.getNewScreenTimeToDisplay as jest.Mock).mockRejectedValue(new Error('Failed'));

    const spy = jest.spyOn(require('@sentry/core'), 'timestampInSeconds');
    const fallbackTime = Date.now() / 1000;
    spy.mockReturnValue(fallbackTime);

    const listener = jest.fn();
    emitter.onceNewFrame(listener);

    // Wait for the next event loop to allow startListenerAsync to call NATIVE.getNewScreenTimeToDisplay
    await Promise.resolve();

    await expect(NATIVE.getNewScreenTimeToDisplay).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith('Failed to receive Native fallback timestamp.', expect.any(Error));

    // Simulate retries and timer
    jest.runAllTimers();

    // Ensure fallback event is emitted
    expect(listener).toHaveBeenCalledWith({
      newFrameTimestampInSeconds: fallbackTime,
      isFallback: true,
    });
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining(
        '[Sentry] Native event emitter did not reply in time. Using JavaScript fallback emitter.',
      ),
    );
  });

  it('should start listener and use fallback when native call fails', async () => {
    jest.useFakeTimers();
    const spy = jest.spyOn(require('@sentry/core'), 'timestampInSeconds');
    const fallbackTime = Date.now() / 1000;
    spy.mockReturnValue(fallbackTime);

    (NATIVE.getNewScreenTimeToDisplay as jest.Mock).mockRejectedValue(new Error('Failed'));

    const listener = jest.fn();
    emitter.onceNewFrame(listener);

    // Wait for the next event loop to allow startListenerAsync to call NATIVE.getNewScreenTimeToDisplay
    await Promise.resolve();

    await expect(NATIVE.getNewScreenTimeToDisplay).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith('Failed to receive Native fallback timestamp.', expect.any(Error));

    // Simulate retries and timer
    jest.runAllTimers();

    // Ensure fallback event is emitted
    expect(listener).toHaveBeenCalledWith({
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
    const spy = jest.spyOn(require('@sentry/core'), 'timestampInSeconds');
    const fallbackTime = Date.now() / 1000;
    spy.mockReturnValue(fallbackTime);

    NATIVE.getNewScreenTimeToDisplay = () => Promise.resolve(null);

    const listener = jest.fn();
    emitter.onceNewFrame(listener);

    // Wait for the next event loop to allow startListenerAsync to call NATIVE.getNewScreenTimeToDisplay
    await Promise.resolve();

    // Simulate retries and timer
    jest.runAllTimers();

    // Ensure fallback event is emitted
    expect(listener).toHaveBeenCalledWith({
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

    (NATIVE.getNewScreenTimeToDisplay as jest.Mock).mockResolvedValueOnce(nativeTimestamp);

    const listener = jest.fn();
    emitter.onceNewFrame(listener);

    expect(NATIVE.getNewScreenTimeToDisplay).toHaveBeenCalled();
  });

  it('should not emit if original event emitter was called', async () => {
    jest.useFakeTimers();

    // Capture the callback passed to addListener
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/ban-types
    let callback: Function = () => {};
    const mockOnce = jest.fn().mockImplementationOnce((eventName, cb) => {
      if (eventName === NewFrameEventName) {
        callback = cb;
      }
      return {
        remove: jest.fn(),
      };
    });

    emitter = createSentryFallbackEventEmitter({
      addListener: jest.fn(),
      initAsync: jest.fn(),
      closeAllAsync: jest.fn(),
      removeListener: jest.fn(),
      once: mockOnce,
    });

    emitter.initAsync();
    const listener = jest.fn();
    emitter.onceNewFrame(listener);
    callback({
      newFrameTimestampInSeconds: 67890,
    });

    // Wait for the next event loop to allow startListenerAsync to call NATIVE.getNewScreenTimeToDisplay
    await Promise.resolve();

    // Simulate retries and timer
    jest.runAllTimers();

    // Ensure fallback event is emitted
    expect(listener).toHaveBeenCalledWith({
      newFrameTimestampInSeconds: 67890,
      isFallback: undefined,
    });
    expect(logger.log).not.toBeCalled();
  });

  it('should retry up to maxRetries and emit fallback if no response', async () => {
    jest.useFakeTimers();

    const listener = jest.fn();
    emitter.onceNewFrame(listener);

    // Wait for the next event loop to allow startListenerAsync to call NATIVE.getNewScreenTimeToDisplay
    await Promise.resolve();

    expect(logger.log).not.toHaveBeenCalled();

    // Simulate retries and timer
    jest.runAllTimers();

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ isFallback: true }));
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('Native event emitter did not reply in time'));

    jest.useRealTimers();
  });
});
