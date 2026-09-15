import { debug } from '@sentry/core';

import { createForegroundReplayGuardState } from '../../src/js/replay/foregroundReplayGuard';
import { NATIVE } from '../../src/js/wrapper';

jest.mock('../../src/js/wrapper');

describe('createForegroundReplayGuardState', () => {
  let mockGetCurrentReplayId: jest.MockedFunction<typeof NATIVE.getCurrentReplayId>;
  let mockStopReplay: jest.MockedFunction<typeof NATIVE.stopReplay>;
  let mockStartReplayBuffering: jest.MockedFunction<typeof NATIVE.startReplayBuffering>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockGetCurrentReplayId = NATIVE.getCurrentReplayId as jest.MockedFunction<typeof NATIVE.getCurrentReplayId>;
    mockStopReplay = NATIVE.stopReplay as jest.MockedFunction<typeof NATIVE.stopReplay>;
    mockStartReplayBuffering = NATIVE.startReplayBuffering as jest.MockedFunction<typeof NATIVE.startReplayBuffering>;
    mockStopReplay.mockResolvedValue(undefined);
    mockStartReplayBuffering.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('when the app backgrounds', () => {
    it('stops replay when a replay is currently active', () => {
      // Arrange
      mockGetCurrentReplayId.mockReturnValue('active-replay-id');
      const { handleAppStateChange } = createForegroundReplayGuardState(1000);

      // Act
      handleAppStateChange('background');

      // Assert
      expect(mockStopReplay).toHaveBeenCalledTimes(1);
    });

    it('does not stop replay when nothing is active', () => {
      // Arrange
      mockGetCurrentReplayId.mockReturnValue(null);
      const { handleAppStateChange } = createForegroundReplayGuardState(1000);

      // Act
      handleAppStateChange('background');

      // Assert
      expect(mockStopReplay).not.toHaveBeenCalled();
    });
  });

  describe('when the app returns to the foreground', () => {
    it('restarts replay in buffer mode after the configured delay when it stopped an active replay', () => {
      // Arrange
      mockGetCurrentReplayId.mockReturnValue('active-replay-id');
      const { handleAppStateChange } = createForegroundReplayGuardState(1000);
      handleAppStateChange('background');

      // Act
      handleAppStateChange('active');

      // Assert
      expect(mockStartReplayBuffering).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1000);
      expect(mockStartReplayBuffering).toHaveBeenCalledTimes(1);
    });

    it('does not restart replay when nothing was stopped', () => {
      // Arrange
      mockGetCurrentReplayId.mockReturnValue(null);
      const { handleAppStateChange } = createForegroundReplayGuardState(1000);
      handleAppStateChange('background');

      // Act
      handleAppStateChange('active');
      jest.advanceTimersByTime(1000);

      // Assert
      expect(mockStartReplayBuffering).not.toHaveBeenCalled();
    });

    it('does not restart replay again for a subsequent active event with nothing pending', () => {
      // Arrange
      mockGetCurrentReplayId.mockReturnValue('active-replay-id');
      const { handleAppStateChange } = createForegroundReplayGuardState(1000);
      handleAppStateChange('background');
      handleAppStateChange('active');
      jest.advanceTimersByTime(1000);

      // Act
      handleAppStateChange('active');
      jest.advanceTimersByTime(1000);

      // Assert
      expect(mockStartReplayBuffering).toHaveBeenCalledTimes(1);
    });
  });

  describe('when the app backgrounds again before the delayed restart fires', () => {
    it('cancels the pending restart', () => {
      // Arrange
      mockGetCurrentReplayId.mockReturnValue('active-replay-id');
      const { handleAppStateChange } = createForegroundReplayGuardState(1000);
      handleAppStateChange('background');
      handleAppStateChange('active');

      // Act: replay was already stopped, so this background transition finds nothing active.
      mockGetCurrentReplayId.mockReturnValue(null);
      handleAppStateChange('background');
      jest.advanceTimersByTime(1000);

      // Assert
      expect(mockStartReplayBuffering).not.toHaveBeenCalled();
    });
  });

  describe('detach', () => {
    it('cancels a pending restart', () => {
      // Arrange
      mockGetCurrentReplayId.mockReturnValue('active-replay-id');
      const { handleAppStateChange, detach } = createForegroundReplayGuardState(1000);
      handleAppStateChange('background');
      handleAppStateChange('active');

      // Act
      detach();
      jest.advanceTimersByTime(1000);

      // Assert
      expect(mockStartReplayBuffering).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('logs and does not throw when stopReplay rejects', async () => {
      // Arrange
      mockGetCurrentReplayId.mockReturnValue('active-replay-id');
      mockStopReplay.mockRejectedValue(new Error('native error'));
      const debugErrorSpy = jest.spyOn(debug, 'error').mockImplementation(() => {});
      const { handleAppStateChange } = createForegroundReplayGuardState(1000);

      // Act
      handleAppStateChange('background');
      await Promise.resolve();
      await Promise.resolve();

      // Assert
      expect(debugErrorSpy).toHaveBeenCalled();
    });

    it('logs and does not throw when startReplayBuffering rejects', async () => {
      // Arrange
      mockGetCurrentReplayId.mockReturnValue('active-replay-id');
      mockStartReplayBuffering.mockRejectedValue(new Error('native error'));
      const debugErrorSpy = jest.spyOn(debug, 'error').mockImplementation(() => {});
      const { handleAppStateChange } = createForegroundReplayGuardState(1000);
      handleAppStateChange('background');
      handleAppStateChange('active');

      // Act
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();

      // Assert
      expect(debugErrorSpy).toHaveBeenCalled();
    });
  });
});

describe('attachForegroundReplayGuard', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('subscribes to AppState changes on iOS', () => {
    // Arrange
    jest.resetModules();
    jest.doMock('react-native', () => ({
      AppState: { isAvailable: true, addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
      Platform: { OS: 'ios' },
    }));
    const { attachForegroundReplayGuard: attach } = require('../../src/js/replay/foregroundReplayGuard');
    const { AppState } = require('react-native');

    // Act
    attach(1000);

    // Assert
    expect(AppState.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('does not subscribe on Android', () => {
    // Arrange
    jest.resetModules();
    jest.doMock('react-native', () => ({
      AppState: { isAvailable: true, addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
      Platform: { OS: 'android' },
    }));
    const { attachForegroundReplayGuard: attach } = require('../../src/js/replay/foregroundReplayGuard');
    const { AppState } = require('react-native');

    // Act
    attach(1000);

    // Assert
    expect(AppState.addEventListener).not.toHaveBeenCalled();
  });

  it('detach removes the AppState subscription', () => {
    // Arrange
    const removeMock = jest.fn();
    jest.resetModules();
    jest.doMock('react-native', () => ({
      AppState: { isAvailable: true, addEventListener: jest.fn(() => ({ remove: removeMock })) },
      Platform: { OS: 'ios' },
    }));
    const { attachForegroundReplayGuard: attach } = require('../../src/js/replay/foregroundReplayGuard');

    // Act
    const detach = attach(1000);
    detach();

    // Assert
    expect(removeMock).toHaveBeenCalledTimes(1);
  });
});
