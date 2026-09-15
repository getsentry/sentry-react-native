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

/** A promise whose resolution is controlled from outside, to pin down in-flight timing precisely. */
function createDeferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createForegroundReplayGuardState', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('when the app backgrounds', () => {
    it('stops replay when active, and only once for repeated background events', () => {
      // Arrange
      const deps = createDeps('active-replay-id');
      const { handleAppStateChange } = createForegroundReplayGuardState(1000, deps);

      // Act
      handleAppStateChange('background');
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

    it('does not schedule extra restarts for repeated active events, before or after the delay fires', () => {
      // Arrange
      const deps = createDeps('active-replay-id');
      const { handleAppStateChange } = createForegroundReplayGuardState(1000, deps);
      handleAppStateChange('background');
      handleAppStateChange('active');

      // Act: a repeat before the timer fires, then another after it already has.
      handleAppStateChange('active');
      jest.advanceTimersByTime(1000);
      handleAppStateChange('active');
      jest.advanceTimersByTime(1000);

      // Assert
      expect(deps.startReplayBuffering).toHaveBeenCalledTimes(1);
    });
  });

  describe('the iOS inactive fallback (background may never arrive if JS suspends)', () => {
    it('stops replay after the fallback delay when inactive is not followed by background or active', () => {
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

    it('cancels the fallback stop when active follows before the delay elapses', () => {
      // Arrange: a brief interruption, not a real backgrounding.
      const deps = createDeps('active-replay-id');
      const { handleAppStateChange } = createForegroundReplayGuardState(1000, deps);
      handleAppStateChange('inactive');

      // Act
      handleAppStateChange('active');
      jest.advanceTimersByTime(5000);

      // Assert
      expect(deps.stopReplay).not.toHaveBeenCalled();
    });

    it('stops once (not twice) when background follows before the fallback delay elapses', () => {
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
    it('cancels the pending restart while still backgrounded, then still restarts once foregrounded again', () => {
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

      // Act: foreground again.
      handleAppStateChange('active');
      jest.advanceTimersByTime(1000);

      // Assert: this time the restart goes through.
      expect(deps.startReplayBuffering).toHaveBeenCalledTimes(1);
    });
  });

  describe('when the app backgrounds while a scheduled restart is already in flight', () => {
    it('stops the newly-started replay once the in-flight restart resolves', async () => {
      // Arrange
      const deps = createDeps('active-replay-id');
      const startDeferred = createDeferred<void>();
      deps.startReplayBuffering.mockReturnValue(startDeferred.promise);
      const { handleAppStateChange } = createForegroundReplayGuardState(1000, deps);
      handleAppStateChange('background');
      handleAppStateChange('active');
      jest.advanceTimersByTime(1000);
      expect(deps.startReplayBuffering).toHaveBeenCalledTimes(1);

      // Act: background again while the restart is still in flight - must not
      // be missed just because `startReplayBuffering()` hasn't resolved yet.
      deps.getCurrentReplayId.mockReturnValue('new-replay-id');
      handleAppStateChange('background');
      expect(deps.stopReplay).toHaveBeenCalledTimes(1);

      startDeferred.resolve();
      await startDeferred.promise;
      await Promise.resolve();

      // Assert: the just-restarted session gets stopped instead of left running unprotected.
      expect(deps.stopReplay).toHaveBeenCalledTimes(2);
    });

    it('does not double-schedule a restart for an active event received while restarting', () => {
      // Arrange
      const deps = createDeps('active-replay-id');
      const startDeferred = createDeferred<void>();
      deps.startReplayBuffering.mockReturnValue(startDeferred.promise);
      const { handleAppStateChange } = createForegroundReplayGuardState(1000, deps);
      handleAppStateChange('background');
      handleAppStateChange('active');
      jest.advanceTimersByTime(1000);
      expect(deps.startReplayBuffering).toHaveBeenCalledTimes(1);

      // Act: a spurious/duplicate active event while the restart is in flight.
      handleAppStateChange('active');
      jest.advanceTimersByTime(1000);

      // Assert
      expect(deps.startReplayBuffering).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('logs and does not schedule a restart when stopReplay rejects', async () => {
      // Arrange: the guard isn't confident replay actually stopped, so it
      // doesn't restart it on a later active event.
      const deps = createDeps('active-replay-id');
      deps.stopReplay.mockReturnValue(Promise.reject(new Error('native error')));
      const debugErrorSpy = jest.spyOn(debug, 'error').mockImplementation(() => {});
      const { handleAppStateChange } = createForegroundReplayGuardState(1000, deps);
      handleAppStateChange('background');
      await Promise.resolve();
      await Promise.resolve();

      // Act
      handleAppStateChange('active');
      jest.advanceTimersByTime(1000);

      // Assert
      expect(debugErrorSpy).toHaveBeenCalled();
      expect(deps.startReplayBuffering).not.toHaveBeenCalled();
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

  it('defaults the restart delay to 1000ms when not given', () => {
    // Arrange
    jest.useFakeTimers();
    const { setup, client, native, invalidateCachedReplayId, simulateAppStateChange } = setUp();

    // Act
    setup(client as unknown as Client, undefined, native, invalidateCachedReplayId);
    simulateAppStateChange('background');
    simulateAppStateChange('active');
    jest.advanceTimersByTime(999);
    expect(native.startReplayBuffering).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);

    // Assert
    expect(native.startReplayBuffering).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('invalidates the cached replay id on both the stop and the restart', async () => {
    // Arrange
    jest.useFakeTimers();
    const { setup, client, native, invalidateCachedReplayId, simulateAppStateChange } = setUp();
    setup(client as unknown as Client, 1000, native, invalidateCachedReplayId);

    // Act: background stops replay.
    simulateAppStateChange('background');
    await Promise.resolve();
    expect(native.stopReplay).toHaveBeenCalledTimes(1);
    expect(invalidateCachedReplayId).toHaveBeenCalledTimes(1);

    // Act: foreground restarts it.
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
