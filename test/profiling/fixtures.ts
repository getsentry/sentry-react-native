import type * as Hermes from '../../src/js/profiling/hermes';
import type { NativeProfileEvent } from '../../src/js/profiling/nativeTypes';
import type { HermesProfileEvent } from '../../src/js/profiling/types';

/**
 * Creates a mock Hermes profile that is valid enough to be added to an envelope.
 * Min 2 samples are required by Sentry to be valid.
 */
export function createMockMinimalValidHermesProfile(): Hermes.Profile {
  return {
    samples: [
      {
        cpu: '-1',
        name: '',
        ts: '10',
        pid: 54822,
        tid: '14509472',
        weight: '1',
        sf: 1,
      },
      {
        cpu: '-1',
        name: '',
        ts: '20',
        pid: 54822,
        tid: '14509472',
        weight: '1',
        sf: 1,
      },
    ],
    stackFrames: {
      1: {
        name: '[root]',
        category: 'root',
      },
    },
    traceEvents: [],
  };
}

/**
 * Creates a mock Hermes profile event (Sentry structured profile).
 * */
export function createMockMinimalValidHermesProfileEvent(): HermesProfileEvent {
  return {
    platform: 'javascript',
    version: '1',
    transaction: {
      active_thread_id: '123',
    },
    profile: {
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
  };
}

/**
 * Create a mock native (iOS/Apple) profile.
 */
export function createMockMinimalValidAppleProfile(): NativeProfileEvent {
  return {
    debug_meta: {
      images: [
        {
          type: 'macho',
          code_file: 'test.app',
          debug_id: '123',
          image_addr: '0x0000000000000002',
          image_size: 100,
        },
      ],
    },
    measurements: {
      example: {
        unit: 'ms',
        values: [
          {
            elapsed_since_start_ns: 100,
            value: 1,
          },
        ],
      },
    },
    profile: {
      frames: [
        {
          instruction_addr: '0x0000000000000003',
        },
        {
          instruction_addr: '0x0000000000000004',
        },
      ],
      samples: [
        {
          elapsed_since_start_ns: '100',
          stack_id: 0,
          thread_id: '456',
          queue_address: '0x0000000000000001',
        },
        {
          elapsed_since_start_ns: '200',
          stack_id: 0,
          thread_id: '456',
          queue_address: '0x0000000000000001',
        },
      ],
      stacks: [[0, 1]],
      thread_metadata: {
        '456': {
          name: 'NativeThread',
          priority: 1,
        },
      },
      queue_metadata: {
        '0x0000000000000001': {
          label: 'test-queue',
        },
      },
    },
    profile_id: '789',
    transaction: {
      active_thread_id: '456',
    },
  };
}
