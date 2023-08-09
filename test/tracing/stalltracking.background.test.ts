import type { AppStateStatus } from 'react-native';

import { StallTrackingInstrumentation } from '../../src/js/tracing/stalltracking';

describe('BackgroundEventListener', () => {
  it('Stall tracking should set _isBackground to false, update _lastIntervalMs, and call _iteration when state is active and _timeout is not null', () => {
    const stallTracking = new StallTrackingInstrumentation();
    const LOOP_TIMEOUT_INTERVAL_MS = 500; // Change this value based on your actual interval value
    const currentTime = Date.now();
    stallTracking['_lastIntervalMs'] = currentTime;
    stallTracking['_timeout'] = setTimeout(() => {}, LOOP_TIMEOUT_INTERVAL_MS); // Create a fake timeout to simulate a running interval
    stallTracking['_isBackground'] = true;
    jest.useFakeTimers(); // Enable fake timers to control timeouts
    stallTracking['_backgroundEventListener']('active' as AppStateStatus);
    // Check if _isBackground is set to false and _lastIntervalMs is updated correctly
    expect(stallTracking['_isBackground']).toBe(false);
    expect(stallTracking['_lastIntervalMs']).toBeGreaterThanOrEqual(currentTime);
    jest.runOnlyPendingTimers(); // Fast-forward the timer to execute the timeout function
  });
  it('Stall tracking should set _isBackground to true when state is not active', () => {
    const stallTracking = new StallTrackingInstrumentation();
    stallTracking['_isBackground'] = false;
    stallTracking['_backgroundEventListener']('background' as AppStateStatus);
    // Check if _isBackground is set to true
    expect(stallTracking['_isBackground']).toBe(true);
  });
  it('Stall tracking should not call _iteration when state is active but _timeout is null', () => {
    const stallTracking = new StallTrackingInstrumentation();
    stallTracking['_timeout'] = null;
    // Mock _iteration
    stallTracking['_iteration'] = jest.fn();
    jest.useFakeTimers(); // Enable fake timers to control timeouts
    stallTracking['_backgroundEventListener']('active' as AppStateStatus);

    expect(stallTracking['_iteration']).not.toBeCalled();
  });
  it('Stall tracking should call _iteration when state is active and _timeout is defined', () => {
    const stallTracking = new StallTrackingInstrumentation();
    stallTracking['_timeout'] = setTimeout(() => {}, 500);
    // Mock _iteration
    stallTracking['_iteration'] = jest.fn(); // Create a fake timeout to simulate a running interval
    jest.useFakeTimers(); // Enable fake timers to control timeouts
    stallTracking['_backgroundEventListener']('active' as AppStateStatus);
    expect(stallTracking['_iteration']).toBeCalled();
  });
});
