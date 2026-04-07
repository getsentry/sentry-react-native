jest.mock('../../src/js/utils/environment');
jest.mock('../../src/js/profiling/debugid');

import type { Event } from '@sentry/core';

import { getDebugMetadata } from '../../src/js/profiling/debugid';
import type { AndroidCombinedProfileEvent, CombinedProfileEvent } from '../../src/js/profiling/types';
import { enrichAndroidProfileWithEventContext, enrichCombinedProfileWithEventContext } from '../../src/js/profiling/utils';
import { getDefaultEnvironment } from '../../src/js/utils/environment';
import { createMockMinimalValidAndroidProfile, createMockMinimalValidHermesProfileEvent } from './fixtures';

describe('enrichCombinedProfileWithEventContext', () => {
  beforeEach(() => {
    (getDefaultEnvironment as jest.Mock).mockReturnValue('production');
    (getDebugMetadata as jest.Mock).mockReturnValue([]);
  });

  function createMockEvent(overrides?: Partial<Event>): Event {
    return {
      event_id: 'test-event-id',
      transaction: 'test-transaction',
      release: 'test-release',
      environment: 'test-env',
      start_timestamp: 1000,
      contexts: {
        trace: {
          trace_id: '12345678901234567890123456789012',
        },
        os: { name: 'iOS', version: '17.0' },
        device: {},
      },
      ...overrides,
    };
  }

  test('should use profilingStartTimestampNs for timestamp when available', () => {
    const profilingStartTimestampNs = 1500 * 1e9; // 1500 seconds in ns
    const profile: CombinedProfileEvent = {
      ...createMockMinimalValidHermesProfileEvent(),
      profilingStartTimestampNs,
    };
    const event = createMockEvent({ start_timestamp: 1000 }); // earlier than profiling start

    const result = enrichCombinedProfileWithEventContext('profile-id', profile, event);

    expect(result).not.toBeNull();
    expect(result!.timestamp).toBe(new Date(profilingStartTimestampNs / 1e6).toISOString());
    // Should NOT use event.start_timestamp
    expect(result!.timestamp).not.toBe(new Date(1000 * 1000).toISOString());
  });

  test('should fall back to event.start_timestamp when profilingStartTimestampNs is not set', () => {
    const profile: CombinedProfileEvent = createMockMinimalValidHermesProfileEvent();
    const event = createMockEvent({ start_timestamp: 1000 });

    const result = enrichCombinedProfileWithEventContext('profile-id', profile, event);

    expect(result).not.toBeNull();
    expect(result!.timestamp).toBe(new Date(1000 * 1000).toISOString());
  });

  test('should not include profilingStartTimestampNs in the output', () => {
    const profile: CombinedProfileEvent = {
      ...createMockMinimalValidHermesProfileEvent(),
      profilingStartTimestampNs: 1500 * 1e9,
    };
    const event = createMockEvent();

    const result = enrichCombinedProfileWithEventContext('profile-id', profile, event);

    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty('profilingStartTimestampNs');
  });
});

describe('enrichAndroidProfileWithEventContext', () => {
  beforeEach(() => {
    (getDefaultEnvironment as jest.Mock).mockReturnValue('production');
    (getDebugMetadata as jest.Mock).mockReturnValue([]);
  });

  function createMockEvent(overrides?: Partial<Event>): Event {
    return {
      event_id: 'test-event-id',
      transaction: 'test-transaction',
      release: 'test-release',
      environment: 'test-env',
      start_timestamp: 1000,
      contexts: {
        trace: {
          trace_id: '12345678901234567890123456789012',
        },
        os: { name: 'Android', version: '14' },
        device: {},
      },
      ...overrides,
    };
  }

  function createMockAndroidCombinedProfile(
    overrides?: Partial<AndroidCombinedProfileEvent>,
  ): AndroidCombinedProfileEvent {
    const hermesProfileEvent = createMockMinimalValidHermesProfileEvent();
    return {
      platform: 'android',
      sampled_profile: createMockMinimalValidAndroidProfile().sampled_profile,
      js_profile: hermesProfileEvent.profile,
      android_api_level: 34,
      duration_ns: '1000000',
      active_thread_id: '123',
      ...overrides,
    };
  }

  test('should use profilingStartTimestampNs for timestamp when available', () => {
    const profilingStartTimestampNs = 1500 * 1e9;
    const profile = createMockAndroidCombinedProfile({ profilingStartTimestampNs });
    const event = createMockEvent({ start_timestamp: 1000 });

    const result = enrichAndroidProfileWithEventContext('profile-id', profile, event);

    expect(result).not.toBeNull();
    expect(result!.timestamp).toBe(new Date(profilingStartTimestampNs / 1e6).toISOString());
    expect(result!.timestamp).not.toBe(new Date(1000 * 1000).toISOString());
  });

  test('should fall back to event.start_timestamp when profilingStartTimestampNs is not set', () => {
    const profile = createMockAndroidCombinedProfile();
    const event = createMockEvent({ start_timestamp: 1000 });

    const result = enrichAndroidProfileWithEventContext('profile-id', profile, event);

    expect(result).not.toBeNull();
    expect(result!.timestamp).toBe(new Date(1000 * 1000).toISOString());
  });

  test('should not include profilingStartTimestampNs in the output', () => {
    const profile = createMockAndroidCombinedProfile({ profilingStartTimestampNs: 1500 * 1e9 });
    const event = createMockEvent();

    const result = enrichAndroidProfileWithEventContext('profile-id', profile, event);

    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty('profilingStartTimestampNs');
  });
});
