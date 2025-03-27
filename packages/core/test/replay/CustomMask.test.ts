import { beforeEach, describe, expect, it } from '@jest/globals';

describe('CustomMask', () => {
  beforeEach(() => {
    jest.mock('../../src/js/utils/environment', () => ({
      isExpoGo: () => false,
    }));
    jest.resetModules();
  });

  it('returns a fallback when isExpoGo is true', () => {
    jest.mock('../../src/js/utils/environment', () => ({
      isExpoGo: () => true,
    }));

    const { Mask, Unmask, MaskFallback, UnmaskFallback } = require('../../src/js/replay/CustomMask');

    expect(Mask).toBe(MaskFallback);
    expect(Unmask).toBe(UnmaskFallback);
  });

  it('returns a fallback when native view manager is missing', () => {
    jest.mock('react-native', () => ({
      UIManager: {},
      View: jest.fn(),
    }));

    const { Mask, Unmask, MaskFallback, UnmaskFallback } = require('../../src/js/replay/CustomMask');

    expect(Mask).toBe(MaskFallback);
    expect(Unmask).toBe(UnmaskFallback);
  });

  it('returns a fallback component when native view manager config is missing', () => {
    jest.mock('react-native', () => ({
      UIManager: {
        hasViewManagerConfig: () => false,
      },
      View: jest.fn(),
    }));

    const { Mask, Unmask, MaskFallback, UnmaskFallback } = require('../../src/js/replay/CustomMask');

    expect(Mask).toBe(MaskFallback);
    expect(Unmask).toBe(UnmaskFallback);
  });

  it('returns native components when native components exist', () => {
    const mockMaskComponent = jest.fn();
    const mockUnmaskComponent = jest.fn();
    const mockNativeComponentRegistryGet = jest.fn().mockImplementation((componentName: string) => {
      if (componentName === 'RNSentryReplayMask') {
        return mockMaskComponent;
      } else if (componentName === 'RNSentryReplayUnmask') {
        return mockUnmaskComponent;
      } else {
        throw new Error(`Unknown component name: ${componentName}`);
      }
    });

    jest.mock('react-native/Libraries/NativeComponent/NativeComponentRegistry', () => ({
      get: mockNativeComponentRegistryGet,
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

    expect(mockNativeComponentRegistryGet).toBeCalledTimes(2);
    expect(mockNativeComponentRegistryGet).toBeCalledWith('RNSentryReplayMask', expect.any(Function));
    expect(mockNativeComponentRegistryGet).toBeCalledWith('RNSentryReplayUnmask', expect.any(Function));
  });
});
