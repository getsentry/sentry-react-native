import type { AppStateStatus } from 'react-native';

import { stallTrackingIntegration } from '../../../../src/js/tracing/integrations/stalltracking';

type StallTrackingWithTestProperties = ReturnType<typeof stallTrackingIntegration> & {
  isTracking: boolean;
  _internalState: {
    isBackground: boolean;
    lastIntervalMs: number;
    timeout: ReturnType<typeof setTimeout> | null;
    iteration: () => void;
    backgroundEventListener: (event: string) => void;
  };
};

describe('BackgroundEventListener', () => {
  it('Stall tracking should set _isBackground to false, update _lastIntervalMs, and call _iteration when state is active and _timeout is not null', () => {
    const stallTracking = stallTrackingIntegration() as StallTrackingWithTestProperties;
    const LOOP_TIMEOUT_INTERVAL_MS = 500; // Change this value based on your actual interval value
    const currentTime = Date.now();
    stallTracking['_internalState']['lastIntervalMs'] = currentTime;
    stallTracking['_internalState']['timeout'] = setTimeout(() => {}, LOOP_TIMEOUT_INTERVAL_MS); // Create a fake timeout to simulate a running interval
    stallTracking['_internalState']['isBackground'] = true;
    jest.useFakeTimers(); // Enable fake timers to control timeouts
    stallTracking['_internalState']['backgroundEventListener']('active' as AppStateStatus);
    // Check if _isBackground is set to false and _lastIntervalMs is updated correctly
    expect(stallTracking['_internalState']['isBackground']).toBe(false);
    expect(stallTracking['_internalState']['lastIntervalMs']).toBeGreaterThanOrEqual(currentTime);
    jest.runOnlyPendingTimers(); // Fast-forward the timer to execute the timeout function
  });
  it('Stall tracking should set _isBackground to true when state is not active', () => {
    const stallTracking = stallTrackingIntegration() as StallTrackingWithTestProperties;
    stallTracking['_internalState']['isBackground'] = false;
    stallTracking['_internalState']['backgroundEventListener']('background' as AppStateStatus);
    // Check if _isBackground is set to true
    expect(stallTracking['_internalState']['isBackground']).toBe(true);
  });
  it('Stall tracking should not call _iteration when state is active but _timeout is null', () => {
    const stallTracking = stallTrackingIntegration() as StallTrackingWithTestProperties;
    stallTracking['_internalState']['timeout'] = null;
    // Mock _iteration
    stallTracking['_internalState']['iteration'] = jest.fn();
    jest.useFakeTimers(); // Enable fake timers to control timeouts
    stallTracking['_internalState']['backgroundEventListener']('active' as AppStateStatus);

    expect(stallTracking['_internalState']['iteration']).not.toBeCalled();
  });
  it('Stall tracking should call _iteration when state is active and _timeout is defined', () => {
    const stallTracking = stallTrackingIntegration() as StallTrackingWithTestProperties;
    stallTracking['_internalState']['timeout'] = setTimeout(() => {}, 500);
    // Mock _iteration
    stallTracking['_internalState']['iteration'] = jest.fn(); // Create a fake timeout to simulate a running interval
    jest.useFakeTimers(); // Enable fake timers to control timeouts
    stallTracking['_internalState']['backgroundEventListener']('active' as AppStateStatus);
    expect(stallTracking['_internalState']['iteration']).toBeCalled();
  });
});
