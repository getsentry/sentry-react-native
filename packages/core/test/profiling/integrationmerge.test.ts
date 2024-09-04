import { addNativeProfileToHermesProfile } from '../../src/js/profiling/integration';
import type { CombinedProfileEvent } from '../../src/js/profiling/types';
import { createMockMinimalValidAppleProfile, createMockMinimalValidHermesProfileEvent } from './fixtures';

describe('merge Hermes and Native profiles - addNativeProfileToHermesProfile', () => {
  it('should prefer Hermes meta data over Native', () => {
    expect(
      addNativeProfileToHermesProfile(createMockMinimalValidHermesProfileEvent(), createMockMinimalValidAppleProfile()),
    ).toEqual(<CombinedProfileEvent>{
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
          {
            instruction_addr: '0x0000000000000003',
            platform: 'cocoa',
          },
          {
            instruction_addr: '0x0000000000000004',
            platform: 'cocoa',
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
          {
            elapsed_since_start_ns: '100',
            stack_id: 1,
            thread_id: '456',
            queue_address: '0x0000000000000001',
          },
          {
            elapsed_since_start_ns: '200',
            stack_id: 1,
            thread_id: '456',
            queue_address: '0x0000000000000001',
          },
        ],
        stacks: [[0], [1, 2]],
        thread_metadata: {
          '123': {
            name: 'JavaScriptThread',
            priority: 1,
          },
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
    });
  });
  it('should keep only Hermes if Native has the same thread id', () => {
    const appleProfilingEvent = createMockMinimalValidAppleProfile();
    expect(
      addNativeProfileToHermesProfile(createMockMinimalValidHermesProfileEvent(), {
        ...appleProfilingEvent,
        profile: {
          ...appleProfilingEvent.profile,
          samples: appleProfilingEvent.profile.samples.map(sample => ({
            ...sample,
            thread_id: '123',
          })),
          thread_metadata: {
            '123': {
              name: 'JavaScriptThread',
              priority: 1,
            },
          },
        },
      }),
    ).toEqual(<CombinedProfileEvent>{
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
          {
            instruction_addr: '0x0000000000000003',
            platform: 'cocoa',
          },
          {
            instruction_addr: '0x0000000000000004',
            platform: 'cocoa',
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
        stacks: [[0], [1, 2]],
        thread_metadata: {
          '123': {
            name: 'JavaScriptThread',
            priority: 1,
          },
        },
        queue_metadata: {
          '0x0000000000000001': {
            label: 'test-queue',
          },
        },
      },
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
    });
  });
});
