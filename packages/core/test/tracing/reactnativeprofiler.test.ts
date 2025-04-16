import { Profiler } from '@sentry/react';
import type { ProfilerProps } from '@sentry/react/build/types/profiler';
import type { ReactNativeWrapperOptions } from 'src/js/options';

import { ReactNativeProfiler } from '../../src/js/tracing';

jest.mock('@sentry/react', () => ({
  Profiler: jest.fn(),
}));

describe('ReactNativeProfiler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('removes updateProps if removeUpdateProps is true', () => {
    const props: ReactNativeWrapperOptions & { name: string; updateProps: undefined; removeUpdateProps: boolean } = {
      name: 'Root',
      updateProps: undefined,
      removeUpdateProps: true,
    };

    new ReactNativeProfiler(props);

    expect(Profiler).toHaveBeenCalledWith(
      expect.not.objectContaining({
        updateProps: expect.anything(),
      }),
    );

    expect(Profiler).not.toHaveBeenCalledWith(
      expect.objectContaining({
        removeUpdateProps: expect.anything(),
      }),
    );
  });

  it('does not remove updateProps if removeUpdateProps is undefined', () => {
    const props: ProfilerProps & { name: string } = {
      name: 'Root',
      updateProps: { prop: true },
    };

    new ReactNativeProfiler(props);

    expect(Profiler).toHaveBeenCalledWith(
      expect.objectContaining({
        updateProps: { prop: true },
      }),
    );

    expect(Profiler).not.toHaveBeenCalledWith(
      expect.objectContaining({
        removeUpdateProps: expect.anything(),
      }),
    );
  });

  it('does not remove updateProps if removeUpdateProps is false', () => {
    const props: ProfilerProps & { name: string; removeUpdateProps: boolean } = {
      name: 'Root',
      updateProps: { prop: true },
      removeUpdateProps: false,
    };

    new ReactNativeProfiler(props);

    expect(Profiler).toHaveBeenCalledWith(
      expect.objectContaining({
        updateProps: { prop: true },
      }),
    );
    expect(Profiler).not.toHaveBeenCalledWith(
      expect.objectContaining({
        removeUpdateProps: expect.anything(),
      }),
    );
  });
});
