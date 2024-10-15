import type { Client } from '@sentry/types';

import { nativeReleaseIntegration } from '../../src/js/integrations/release';

jest.mock('../../src/js/wrapper', () => ({
  NATIVE: {
    fetchNativeRelease: async () => ({
      build: 'native_build',
      id: 'native_id',
      version: 'native_version',
    }),
  },
}));

describe('Tests the Release integration', () => {
  test('Uses release from native SDK if release/dist are not present in options.', async () => {
    const releaseIntegration = nativeReleaseIntegration();

    const event = await releaseIntegration.processEvent!({}, {}, { getOptions: () => ({}) } as Client);

    expect(event?.release).toBe('native_id@native_version+native_build');
    expect(event?.dist).toBe('native_build');
  });

  test('Uses release from native SDK if release is not present in options.', async () => {
    const releaseIntegration = nativeReleaseIntegration();

    const event = await releaseIntegration.processEvent!({}, {}, {
      getOptions: () => ({ dist: 'options_dist' }),
    } as Client);

    expect(event?.release).toBe('native_id@native_version+native_build');
    expect(event?.dist).toBe('options_dist');
  });

  test('Uses dist from native SDK if dist is not present in options.', async () => {
    const releaseIntegration = nativeReleaseIntegration();

    const event = await releaseIntegration.processEvent!({}, {}, {
      getOptions: () => ({ release: 'options_release' }),
    } as Client);

    expect(event?.release).toBe('options_release');
    expect(event?.dist).toBe('native_build');
  });

  test('Uses release and dist from options', async () => {
    const releaseIntegration = nativeReleaseIntegration();

    const event = await releaseIntegration.processEvent!({}, {}, {
      getOptions: () => ({ dist: 'options_dist', release: 'options_release' }),
    } as Client);

    expect(event?.release).toBe('options_release');
    expect(event?.dist).toBe('options_dist');
  });

  test('Uses __sentry_release and __sentry_dist over everything else.', async () => {
    const releaseIntegration = nativeReleaseIntegration();

    const event = await releaseIntegration.processEvent!(
      {
        extra: {
          __sentry_dist: 'sentry_dist',
          __sentry_release: 'sentry_release',
        },
      },
      {},
      {
        getOptions: () => ({
          dist: 'options_dist',
          release: 'options_release',
        }),
      } as Client,
    );

    expect(event?.release).toBe('sentry_release');
    expect(event?.dist).toBe('sentry_dist');
  });
});
