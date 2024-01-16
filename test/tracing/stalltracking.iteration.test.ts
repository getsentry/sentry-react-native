import { StallTrackingInstrumentation } from '../../src/js/tracing/stalltracking';

describe('Iteration', () => {
  it('Stall tracking does not set _timeout when isTracking is false', () => {
    const stallTracking = new StallTrackingInstrumentation();
    stallTracking['isTracking'] = false;
    stallTracking['_isBackground'] = false;
    stallTracking['_lastIntervalMs'] = Date.now() - 1000; // Force a timeout
    jest.useFakeTimers();
    // Invokes the private _interaction function.
    stallTracking['_iteration']();
    expect(stallTracking['_timeout']).toBeNull();
  });
  it('Stall tracking does not set _timeout when isBackground is true', () => {
    const stallTracking = new StallTrackingInstrumentation();
    stallTracking['isTracking'] = true;
    stallTracking['_isBackground'] = true;
    stallTracking['_lastIntervalMs'] = Date.now() - 1000; // Force a timeout
    jest.useFakeTimers();
    // Invokes the private _interaction function.
    stallTracking['_iteration']();
    expect(stallTracking['_timeout']).toBeNull();
  });
  it('Stall tracking should set _timeout when isTracking is true and isBackground false', () => {
    const stallTracking = new StallTrackingInstrumentation();
    stallTracking['isTracking'] = true;
    stallTracking['_isBackground'] = false;
    jest.useFakeTimers();
    stallTracking['_lastIntervalMs'] = Date.now(); // Force a timeout
    // Invokes the private _interaction function.
    stallTracking['_iteration']();
    expect(stallTracking['_timeout']).toBeDefined();
  });
  it('Stall tracking should update _stallCount and _totalStallTime when timeout condition is met', () => {
    const stallTracking = new StallTrackingInstrumentation();
    const LOOP_TIMEOUT_INTERVAL_MS = 50;
    const _minimumStallThreshold = 100;
    // Call _iteration with totalTimeTaken >= LOOP_TIMEOUT_INTERVAL_MS + _minimumStallThreshold
    const totalTimeTaken = LOOP_TIMEOUT_INTERVAL_MS + _minimumStallThreshold;
    jest.useFakeTimers();
    stallTracking['_lastIntervalMs'] = Date.now() - totalTimeTaken;
    stallTracking['_statsByTransaction'] = new Map();
    stallTracking['_iteration']();
    // Check if _stallCount and _totalStallTime have been updated as expected.
    expect(stallTracking['_stallCount']).toBe(1);
    expect(stallTracking['_totalStallTime']).toBeGreaterThanOrEqual(
      Math.round(totalTimeTaken - LOOP_TIMEOUT_INTERVAL_MS),
    );
  });
});
