import type { Client } from '@sentry/core';

import { debug } from '@sentry/core';

import type {
  ForegroundReplayGuardDependencies,
  ForegroundReplayGuardNativeControls,
  setupForegroundReplayGuard,
} from '../../src/js/replay/foregroundReplayGuard';

import { createForegroundReplayGuardState } from '../../src/js/replay/foregroundReplayGuard';

function createDeps(replayId: string | null = 'active-replay-id'): ForegroundReplayGuardDependencies & {
  getCurrentReplayId: jest.Mock;
  stopReplay: jest.Mock;
  startReplayBuffering: jest.Mock;
} {
  return {
    getCurrentReplayId: jest.fn(() => replayId),
    stopReplay: jest.fn(() => Promise.resolve()),
    startReplayBuffering: jest.fn(() => Promise.resolve()),
  };
}

describe('createForegroundReplayGuardState', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('when the app backgrounds', () => {
    it('stops replay when a replay is currently active', () => {
      // Arrange
      const deps = createDeps('active-replay-id');
      const { handleAppStateChange } = createForegroundReplayGuardState(1000, deps);

      // Act
      handleAppStateChange('background');

      // Assert
      expect(deps.stopReplay).toHaveBeenCalledTimes(1);
    });

    it('does not stop replay when nothing is active', () => {
      // Arrange
      const deps = createDeps(null);
      const { handleAppStateChange } = createForegroundReplayGuardState(1000, deps);

      // Act
      handleAppStateChange('background');

      // Assert
      expect(deps.stopReplay).not.toHaveBeenCalled();
    });

    it('does not stop replay twice for repeated background events', () => {
      // Arrange
      const deps = createDeps('active-replay-id');
      const { handleAppStateChange } = createForegroundReplayGuardState(1000, deps);
      handleAppStateChange('background');

      // Act
      handleAppStateChange('background');

      // Assert
      expect(deps.stopReplay).toHaveBeenCalledTimes(1);
    });
  });

  describe('when the app returns to the foreground', () => {
    it('restarts replay in buffer mode after the configured delay when it stopped an active replay', () => {
      // Arrange
      const deps = createDeps('active-replay-id');
      const { handleAppStateChange } = createForegroundReplayGuardState(1000, deps);
      handleAppStateChange('background');

      // Act
      handleAppStateChange('active');

      // Assert
      expect(deps.startReplayBuffering).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1000);
      expect(deps.startReplayBuffering).toHaveBeenCalledTimes(1);
    });

    it('does not restart replay when nothing was stopped', () => {
      // Arrange
      const deps = createDeps(null);
      const { handleAppStateChange } = createForegroundReplayGuardState(1000, deps);
      handleAppStateChange('background');

      // Act
      handleAppStateChange('active');
      jest.advanceTimersByTime(1000);

      // Assert
      expect(deps.startReplayBuffering).not.toHaveBeenCalled();
    });

    it('does not schedule a second restart for a repeated active event', () => {
      // Arrange
      const deps = createDeps('active-replay-id');
      const { handleAppStateChange } = createForegroundReplayGuardState(1000, deps);
      handleAppStateChange('background');
      handleAppStateChange('active');

      // Act
      handleAppStateChange('active');
      jest.advanceTimersByTime(1000);

      // Assert
      expect(deps.startReplayBuffering).toHaveBeenCalledTimes(1);
    });

    it('does not restart again for a subsequent active event once already restarted', () => {
      // Arrange
      const deps = createDeps('active-replay-id');
      const { handleAppStateChange } = createForegroundReplayGuardState(1000, deps);
      handleAppStateChange('background');
      handleAppStateChange('active');
      jest.advanceTimersByTime(1000);

      // Act
      handleAppStateChange('active');
      jest.advanceTimersByTime(1000);

      // Assert
      expect(deps.startReplayBuffering).toHaveBeenCalledTimes(1);
    });
  });

  describe('when an inactive transition is not followed by background or active', () => {
    it('stops replay after the iOS inactive fallback delay', () => {
      // Arrange
      const deps = createDeps('active-replay-id');
      const { handleAppStateChange } = createForegroundReplayGuardState(1000, deps);

      // Act
      handleAppStateChange('inactive');

      // Assert: not stopped immediately - only after the fallback delay.
      expect(deps.stopReplay).not.toHaveBeenCalled();
      jest.advanceTimersByTime(5000);
      expect(deps.stopReplay).toHaveBeenCalledTimes(1);
    });
  });

  describe('when active follows inactive before the fallback delay elapses', () => {
    it('cancels the fallback stop', () => {
      // Arrange
      const deps = createDeps('active-replay-id');
      const { handleAppStateChange } = createForegroundReplayGuardState(1000, deps);
      handleAppStateChange('inactive');

      // Act: a brief interruption, not a real backgrounding.
      handleAppStateChange('active');
      jest.advanceTimersByTime(5000);

      // Assert
      expect(deps.stopReplay).not.toHaveBeenCalled();
    });
  });

  describe('when background follows inactive before the fallback delay elapses', () => {
    it('stops immediately and does not double-stop when the fallback timer would have fired', () => {
      // Arrange
      const deps = createDeps('active-replay-id');
      const { handleAppStateChange } = createForegroundReplayGuardState(1000, deps);
      handleAppStateChange('inactive');

      // Act
      handleAppStateChange('background');
      jest.advanceTimersByTime(5000);

      // Assert
      expect(deps.stopReplay).toHaveBeenCalledTimes(1);
    });
  });

  describe('when the app backgrounds again before the delayed restart fires', () => {
    it('cancels the pending restart and does not restart when eventually foregrounded past the original delay', () => {
      // Arrange
      const deps = createDeps('active-replay-id');
      const { handleAppStateChange } = createForegroundReplayGuardState(1000, deps);
      handleAppStateChange('background');
      handleAppStateChange('active');

      // Act: background again before the 1000ms restart delay elapses.
      handleAppStateChange('background');
      jest.advanceTimersByTime(1000);

      // Assert: the original restart never fires while backgrounded.
      expect(deps.startReplayBuffering).not.toHaveBeenCalled();
      expect(deps.stopReplay).toHaveBeenCalledTimes(1);
    });

    it('still restarts once foregrounded again', () => {
      // Arrange
      const deps = createDeps('active-replay-id');
      const { handleAppStateChange } = createForegroundReplayGuardState(1000, deps);
      handleAppStateChange('background');
      handleAppStateChange('active');
      handleAppStateChange('background');

      // Act
      handleAppStateChange('active');
      jest.advanceTimersByTime(1000);

      // Assert
      expect(deps.startReplayBuffering).toHaveBeenCalledTimes(1);
    });
  });

  describe('detach', () => {
    it('cancels a pending restart', () => {
      // Arrange
      const deps = createDeps('active-replay-id');
      const { handleAppStateChange, detach } = createForegroundReplayGuardState(1000, deps);
      handleAppStateChange('background');
      handleAppStateChange('active');

      // Act
      detach();
      jest.advanceTimersByTime(1000);

      // Assert
      expect(deps.startReplayBuffering).not.toHaveBeenCalled();
    });

    it('cancels a pending inactive fallback stop', () => {
      // Arrange
      const deps = createDeps('active-replay-id');
      const { handleAppStateChange, detach } = createForegroundReplayGuardState(1000, deps);
      handleAppStateChange('inactive');

      // Act
      detach();
      jest.advanceTimersByTime(5000);

      // Assert
      expect(deps.stopReplay).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('logs and does not throw when stopReplay rejects', async () => {
      // Arrange
      const deps = createDeps('active-replay-id');
      deps.stopReplay.mockReturnValue(Promise.reject(new Error('native error')));
      const debugErrorSpy = jest.spyOn(debug, 'error').mockImplementation(() => {});
      const { handleAppStateChange } = createForegroundReplayGuardState(1000, deps);

      // Act
      handleAppStateChange('background');
      await Promise.resolve();
      await Promise.resolve();

      // Assert
      expect(debugErrorSpy).toHaveBeenCalled();
    });

    it('logs and does not throw when startReplayBuffering rejects', async () => {
      // Arrange
      const deps = createDeps('active-replay-id');
      deps.startReplayBuffering.mockReturnValue(Promise.reject(new Error('native error')));
      const debugErrorSpy = jest.spyOn(debug, 'error').mockImplementation(() => {});
      const { handleAppStateChange } = createForegroundReplayGuardState(1000, deps);
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
    attach(1000, createDeps());

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
    attach(1000, createDeps());

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
    const detach = attach(1000, createDeps());
    detach();

    // Assert
    expect(removeMock).toHaveBeenCalledTimes(1);
  });
});

describe('setupForegroundReplayGuard', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  function setUp(): {
    setup: typeof setupForegroundReplayGuard;
    client: { on: jest.Mock };
    native: ForegroundReplayGuardNativeControls & { [K in keyof ForegroundReplayGuardNativeControls]: jest.Mock };
    invalidateCachedReplayId: jest.Mock;
    simulateAppStateChange: (state: string) => void;
  } {
    jest.resetModules();
    let listener: ((state: string) => void) | undefined;
    jest.doMock('react-native', () => ({
      AppState: {
        isAvailable: true,
        addEventListener: jest.fn((_event: string, cb: (state: string) => void) => {
          listener = cb;
          return { remove: jest.fn() };
        }),
      },
      Platform: { OS: 'ios' },
    }));
    const { setupForegroundReplayGuard: setup } = require('../../src/js/replay/foregroundReplayGuard');

    return {
      setup,
      client: { on: jest.fn() },
      native: {
        getCurrentReplayId: jest.fn(() => 'active-replay-id'),
        stopReplay: jest.fn(() => Promise.resolve()),
        startReplayBuffering: jest.fn(() => Promise.resolve()),
      },
      invalidateCachedReplayId: jest.fn(),
      simulateAppStateChange: (state: string) => listener?.(state),
    };
  }

  it('registers a close handler on the client', () => {
    // Arrange
    const { setup, client, native, invalidateCachedReplayId } = setUp();

    // Act
    setup(client as unknown as Client, 1000, native, invalidateCachedReplayId);

    // Assert
    expect(client.on).toHaveBeenCalledWith('close', expect.any(Function));
  });

  it('invalidates the cached replay id after stopping on background', async () => {
    // Arrange
    const { setup, client, native, invalidateCachedReplayId, simulateAppStateChange } = setUp();
    setup(client as unknown as Client, 1000, native, invalidateCachedReplayId);

    // Act
    simulateAppStateChange('background');
    await Promise.resolve();

    // Assert
    expect(native.stopReplay).toHaveBeenCalledTimes(1);
    expect(invalidateCachedReplayId).toHaveBeenCalledTimes(1);
  });

  it('invalidates the cached replay id again after restarting on foreground', async () => {
    // Arrange
    jest.useFakeTimers();
    const { setup, client, native, invalidateCachedReplayId, simulateAppStateChange } = setUp();
    setup(client as unknown as Client, 1000, native, invalidateCachedReplayId);
    simulateAppStateChange('background');
    await Promise.resolve();

    // Act
    simulateAppStateChange('active');
    jest.advanceTimersByTime(1000);
    await Promise.resolve();

    // Assert
    expect(native.startReplayBuffering).toHaveBeenCalledTimes(1);
    expect(invalidateCachedReplayId).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('invalidates the cached replay id even when stopReplay rejects', async () => {
    // Arrange
    const { setup, client, native, invalidateCachedReplayId, simulateAppStateChange } = setUp();
    native.stopReplay.mockReturnValue(Promise.reject(new Error('native error')));
    jest.spyOn(debug, 'error').mockImplementation(() => {});
    setup(client as unknown as Client, 1000, native, invalidateCachedReplayId);

    // Act
    simulateAppStateChange('background');
    await Promise.resolve();
    await Promise.resolve();

    // Assert
    expect(invalidateCachedReplayId).toHaveBeenCalledTimes(1);
  });
});
