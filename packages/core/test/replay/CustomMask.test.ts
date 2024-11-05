import { describe, expect, it, beforeEach } from '@jest/globals';

describe('CustomMask', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('returns a fallback when native view manager is missing', () => {
    jest.mock('react-native', () => ({
      UIManager: {},
      View: jest.fn(),
    }));

    const { Mask, Unmask } = require('../../src/js/replay/CustomMask');

    expect(Mask).toBeDefined();
    expect(Unmask).toBeDefined();
  });

  it('returns a fallback component when native view manager config is missing', () => {
    jest.mock('react-native', () => ({
      UIManager: {
        hasViewManagerConfig: () => false,
      },
      View: jest.fn(),
    }));

    const { Mask, Unmask } = require('../../src/js/replay/CustomMask');

    expect(Mask).toBeDefined();
    expect(Unmask).toBeDefined();
  });

  it('returns native components when native components exist', () => {
    const mockMaskComponent = jest.fn();
    const mockUnmaskComponent = jest.fn();

    jest.mock('../../src/js/RNSentryReplayMaskNativeComponent', () => ({
      default: mockMaskComponent,
    }));

    jest.mock('../../src/js/RNSentryReplayUnmaskNativeComponent', () => ({
      default: mockUnmaskComponent,
    }));

    jest.mock('react-native', () => ({
      UIManager: {
        hasViewManagerConfig: () => true,
      },
      View: jest.fn(),
    }));

    const { Mask, Unmask } = require('../../src/js/replay/CustomMask');

    expect(Mask).toBe(mockMaskComponent);
    expect(Unmask).toBe(mockUnmaskComponent);
  });
});
