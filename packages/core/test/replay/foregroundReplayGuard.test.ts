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
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('createForegroundReplayGuardState', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('stops replay on background and restarts it in buffer mode after the delay on foreground', async () => {
    // Arrange
    const deps = createDeps('active-replay-id');
    const { handleAppStateChange } = createForegroundReplayGuardState(1000, deps);

    // Act
    handleAppStateChange('background');
    handleAppStateChange('background'); // repeated - must not stop twice
    handleAppStateChange('active');
    handleAppStateChange('active'); // repeated - must not schedule twice

    // Assert
    expect(deps.stopReplay).toHaveBeenCalledTimes(1);
    expect(deps.startReplayBuffering).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1000);
    expect(deps.startReplayBuffering).toHaveBeenCalledTimes(1);
  });

  it('does nothing when there is no active replay to protect', () => {
    // Arrange
    const deps = createDeps(null);
    const { handleAppStateChange } = createForegroundReplayGuardState(1000, deps);

    // Act
    handleAppStateChange('background');
    handleAppStateChange('active');
    jest.advanceTimersByTime(1000);

    // Assert
    expect(deps.stopReplay).not.toHaveBeenCalled();
    expect(deps.startReplayBuffering).not.toHaveBeenCalled();
  });

  it('falls back to stopping on iOS inactive when background never follows (JS may suspend), unless active cancels it', () => {
    // Arrange
    const deps = createDeps('active-replay-id');
    const { handleAppStateChange } = createForegroundReplayGuardState(1000, deps);

    // Act: inactive alone, past the fallback delay, stops replay.
    handleAppStateChange('inactive');
    expect(deps.stopReplay).not.toHaveBeenCalled();
    jest.advanceTimersByTime(5000);
    expect(deps.stopReplay).toHaveBeenCalledTimes(1);
  });

  it('cancels the inactive fallback stop when active follows quickly (a brief interruption, not backgrounding)', () => {
    // Arrange
    const deps = createDeps('active-replay-id');
    const { handleAppStateChange } = createForegroundReplayGuardState(1000, deps);
    handleAppStateChange('inactive');

    // Act
    handleAppStateChange('active');
    jest.advanceTimersByTime(5000);

    // Assert
    expect(deps.stopReplay).not.toHaveBeenCalled();
  });

  it('cancels a pending restart if backgrounded again first, then still restarts once truly foregrounded', async () => {
    // Arrange
    const deps = createDeps('active-replay-id');
    const { handleAppStateChange } = createForegroundReplayGuardState(1000, deps);
    handleAppStateChange('background');
    handleAppStateChange('active');
    handleAppStateChange('background');
    jest.advanceTimersByTime(1000);
    expect(deps.startReplayBuffering).not.toHaveBeenCalled();

    // Act
    handleAppStateChange('active');
    await jest.advanceTimersByTimeAsync(1000);

    // Assert
    expect(deps.startReplayBuffering).toHaveBeenCalledTimes(1);
  });

  it('stops a session restarted while backgrounding was still in flight, instead of leaving it unprotected', async () => {
    // Arrange - regression for a race where the restart's in-flight state was
    // dropped too early, so a background event landing mid-restart was missed.
    const deps = createDeps('active-replay-id');
    const startDeferred = createDeferred<void>();
    deps.startReplayBuffering.mockReturnValue(startDeferred.promise);
    const { handleAppStateChange } = createForegroundReplayGuardState(1000, deps);
    handleAppStateChange('background');
    handleAppStateChange('active');
    await jest.advanceTimersByTimeAsync(1000); // resume timer fires; startReplayBuffering() now in flight
    expect(deps.startReplayBuffering).toHaveBeenCalledTimes(1);

    // Act: background again before the in-flight restart resolves.
    deps.getCurrentReplayId.mockReturnValue('new-replay-id');
    handleAppStateChange('background');
    startDeferred.resolve();
    await startDeferred.promise;
    await Promise.resolve();

    // Assert: the just-restarted session gets stopped, not left running.
    expect(deps.stopReplay).toHaveBeenCalledTimes(2);
  });

  it('does not restart after a failed stop, and logs the failure', async () => {
    // Arrange - regression: a rejected stopReplay() must not leave the guard
    // thinking it stopped, or it schedules a restart against a session that
    // may never have actually stopped.
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

  it('detach cancels a pending restart', () => {
    // Arrange
    const deps = createDeps('active-replay-id');
    const { handleAppStateChange, detach } = createForegroundReplayGuardState(1000, deps);
    handleAppStateChange('background');
    handleAppStateChange('active');

    // Act
    detach();
    jest.advanceTimersByTime(5000);

    // Assert
    expect(deps.startReplayBuffering).not.toHaveBeenCalled();
  });

  it('does not stop replay again after detach, even if a restart was still in flight', async () => {
    // Arrange - regression: detach() only cleared timers, so an in-flight
    // restart's own resolution could still fire a stopReplay() call post-close.
    const deps = createDeps('active-replay-id');
    const startDeferred = createDeferred<void>();
    deps.startReplayBuffering.mockReturnValue(startDeferred.promise);
    const { handleAppStateChange, detach } = createForegroundReplayGuardState(1000, deps);
    handleAppStateChange('background');
    handleAppStateChange('active');
    await jest.advanceTimersByTimeAsync(1000); // restart in flight
    deps.getCurrentReplayId.mockReturnValue('new-replay-id');
    handleAppStateChange('background'); // marks the in-flight restart for a follow-up stop

    // Act
    detach();
    startDeferred.resolve();
    await startDeferred.promise;
    await Promise.resolve();

    // Assert: no follow-up stop after detach.
    expect(deps.stopReplay).toHaveBeenCalledTimes(1);
  });
});

describe('attachForegroundReplayGuard', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('subscribes to AppState on iOS, and detach unsubscribes', () => {
    // Arrange
    const removeMock = jest.fn();
    jest.resetModules();
    jest.doMock('react-native', () => ({
      AppState: { isAvailable: true, addEventListener: jest.fn(() => ({ remove: removeMock })) },
      Platform: { OS: 'ios' },
    }));
    const { attachForegroundReplayGuard: attach } = require('../../src/js/replay/foregroundReplayGuard');
    const { AppState } = require('react-native');

    // Act
    const detach = attach(1000, createDeps());

    // Assert
    expect(AppState.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    detach();
    expect(removeMock).toHaveBeenCalledTimes(1);
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

  it('registers detach on client close, and invalidates the cached replay id on both stop and restart', async () => {
    // Arrange - regression: the guard used to call NATIVE directly, bypassing
    // the integration's own cache invalidation, so getReplayId() kept
    // pointing at the pre-background session.
    jest.useFakeTimers();
    const { setup, client, native, invalidateCachedReplayId, simulateAppStateChange } = setUp();
    setup(client as unknown as Client, 1000, native, invalidateCachedReplayId);
    expect(client.on).toHaveBeenCalledWith('close', expect.any(Function));

    // Act: background stops replay.
    simulateAppStateChange('background');
    await Promise.resolve();
    expect(invalidateCachedReplayId).toHaveBeenCalledTimes(1);

    // Act: foreground restarts it.
    simulateAppStateChange('active');
    await jest.advanceTimersByTimeAsync(1000);

    // Assert
    expect(invalidateCachedReplayId).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });
});
