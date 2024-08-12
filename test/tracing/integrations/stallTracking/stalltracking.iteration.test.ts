import { stallTrackingIntegration } from '../../../../src/js/tracing/integrations/stalltracking';

type StallTrackingWithTestProperties = ReturnType<typeof stallTrackingIntegration> & {
  isTracking: boolean;
  _internalState: {
    isBackground: boolean;
    lastIntervalMs: number;
    timeout: ReturnType<typeof setTimeout> | null;
    stallCount: number;
    totalStallTime: number;
    statsByTransaction: Map<string, { count: number; total: number }>;
    iteration: () => void;
  };
};

describe('Iteration', () => {
  it('Stall tracking does not set _timeout when isTracking is false', () => {
    const stallTracking = stallTrackingIntegration() as StallTrackingWithTestProperties;
    stallTracking['isTracking'] = false;
    stallTracking['_internalState']['isBackground'] = false;
    stallTracking['_internalState']['lastIntervalMs'] = Date.now() - 1000; // Force a timeout
    jest.useFakeTimers();
    // Invokes the private _interaction function.
    stallTracking['_internalState']['iteration']();
    expect(stallTracking['_internalState']['timeout']).toBeNull();
  });
  it('Stall tracking does not set _timeout when isBackground is true', () => {
    const stallTracking = stallTrackingIntegration() as StallTrackingWithTestProperties;
    stallTracking['isTracking'] = true;
    stallTracking['_internalState']['isBackground'] = true;
    stallTracking['_internalState']['lastIntervalMs'] = Date.now() - 1000; // Force a timeout
    jest.useFakeTimers();
    // Invokes the private _interaction function.
    stallTracking['_internalState']['iteration']();
    expect(stallTracking['_internalState']['timeout']).toBeNull();
  });
  it('Stall tracking should set _timeout when isTracking is true and isBackground false', () => {
    const stallTracking = stallTrackingIntegration() as StallTrackingWithTestProperties;
    stallTracking['isTracking'] = true;
    stallTracking['_internalState']['isBackground'] = false;
    jest.useFakeTimers();
    stallTracking['_internalState']['lastIntervalMs'] = Date.now(); // Force a timeout
    // Invokes the private _interaction function.
    stallTracking['_internalState']['iteration']();
    expect(stallTracking['_internalState']['timeout']).toBeDefined();
  });
  it('Stall tracking should update _stallCount and _totalStallTime when timeout condition is met', () => {
    const stallTracking = stallTrackingIntegration() as StallTrackingWithTestProperties;
    const LOOP_TIMEOUT_INTERVAL_MS = 50;
    const _minimumStallThreshold = 100;
    // Call _iteration with totalTimeTaken >= LOOP_TIMEOUT_INTERVAL_MS + _minimumStallThreshold
    const totalTimeTaken = LOOP_TIMEOUT_INTERVAL_MS + _minimumStallThreshold;
    jest.useFakeTimers();
    stallTracking['_internalState']['lastIntervalMs'] = Date.now() - totalTimeTaken;
    stallTracking['_internalState']['statsByTransaction'] = new Map();
    stallTracking['_internalState']['iteration']();
    // Check if _stallCount and _totalStallTime have been updated as expected.
    expect(stallTracking['_internalState']['stallCount']).toBe(1);
    expect(stallTracking['_internalState']['totalStallTime']).toBeGreaterThanOrEqual(
      Math.round(totalTimeTaken - LOOP_TIMEOUT_INTERVAL_MS),
    );
  });
});
