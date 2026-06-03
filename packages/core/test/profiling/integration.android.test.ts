import type { AndroidCombinedProfileEvent } from '../../src/js/profiling/types';

import { createAndroidWithHermesProfile } from '../../src/js/profiling/integration';
import {
  createMockMinimalValidAndroidProfile,
  createMockMinimalValidAndroidProfileWithMeasurements,
  createMockMinimalValidHermesProfileEvent,
} from './fixtures';

describe('merge Hermes and Android profiles - createAndroidWithHermesProfile', () => {
  it('should create Android profile structure with hermes profile', () => {
    expect(
      createAndroidWithHermesProfile(
        createMockMinimalValidHermesProfileEvent(),
        createMockMinimalValidAndroidProfile(),
        987,
      ),
    ).toEqual(<AndroidCombinedProfileEvent>{
      platform: 'android',
      build_id: 'mocked-build-id',
      sampled_profile: 'YW5kcm9pZCB0cmFjZSBlbmNvZGVkIGluIGJhc2UgNjQ=', // base64 encoded 'android trace encoded in base 64'
      js_profile: {
        frames: [
          {
            colno: 33,
            abs_path: 'app:///main.jsbundle',
            function: 'fooA',
            lineno: 1610,
          },
        ],
        samples: [
          {
            elapsed_since_start_ns: '0',
            stack_id: 0,
            thread_id: '123',
          },
          {
            elapsed_since_start_ns: '10000',
            stack_id: 0,
            thread_id: '123',
          },
        ],
        stacks: [[0]],
        thread_metadata: {
          '123': {
            name: 'JavaScriptThread',
            priority: 1,
          },
        },
      },
      android_api_level: 56,
      duration_ns: '987',
      active_thread_id: '123',
    });
  });

  it('should include measurements when present in native Android profile', () => {
    const androidProfile = createMockMinimalValidAndroidProfileWithMeasurements();
    const result = createAndroidWithHermesProfile(createMockMinimalValidHermesProfileEvent(), androidProfile, 987);

    expect(result.measurements).toEqual({
      frozen_frame_renders: {
        unit: 'nanosecond',
        values: [{ elapsed_since_start_ns: 1000000, value: 800000000 }],
      },
      slow_frame_renders: {
        unit: 'nanosecond',
        values: [{ elapsed_since_start_ns: 2000000, value: 20000000 }],
      },
      cpu_usage: {
        unit: 'percent',
        values: [
          { elapsed_since_start_ns: 0, value: 35.5 },
          { elapsed_since_start_ns: 5000000, value: 42.1 },
        ],
      },
      memory_footprint: {
        unit: 'byte',
        values: [{ elapsed_since_start_ns: 0, value: 104857600 }],
      },
    });
  });

  it('should not include measurements when absent from native Android profile', () => {
    const result = createAndroidWithHermesProfile(
      createMockMinimalValidHermesProfileEvent(),
      createMockMinimalValidAndroidProfile(),
      987,
    );

    expect(result.measurements).toBeUndefined();
  });
});
