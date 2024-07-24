import type { Measurements } from '@sentry/types';

export function expectStallMeasurements(measurements: Measurements | undefined) {
  expect(measurements).toBeDefined();

  expect(measurements?.stall_count.value).toBeGreaterThanOrEqual(0);
  expect(measurements?.stall_count.unit).toBe('none');

  expect(measurements?.stall_longest_time.value).toBeGreaterThanOrEqual(0);
  expect(measurements?.stall_longest_time.unit).toBe('millisecond');

  expect(measurements?.stall_total_time.value).toBeGreaterThanOrEqual(0);
  expect(measurements?.stall_total_time.unit).toBe('millisecond');
}

export function expectNonZeroStallMeasurements(measurements: Measurements | undefined) {
  expect(measurements).toBeDefined();

  expect(measurements?.stall_count.value).toBeGreaterThan(0);
  expect(measurements?.stall_count.unit).toBe('none');

  expect(measurements?.stall_longest_time.value).toBeGreaterThan(0);
  expect(measurements?.stall_longest_time.unit).toBe('millisecond');

  expect(measurements?.stall_total_time.value).toBeGreaterThan(0);
  expect(measurements?.stall_total_time.unit).toBe('millisecond');
}
