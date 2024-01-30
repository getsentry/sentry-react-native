import type { MetroConfig } from 'metro';

import { withSentryFramesCollapsed } from '../../src/js/tools/metroconfig';

type MetroFrame = Parameters<Required<Required<MetroConfig>['symbolicator']>['customizeFrame']>[0];

describe('withSentryFramesCollapsed', () => {
  test('adds customizeFrames if undefined ', () => {
    const config = withSentryFramesCollapsed({});
    expect(config.symbolicator?.customizeFrame).toBeDefined();
  });

  test('wraps existing customizeFrames', async () => {
    const originalCustomizeFrame = jest.fn();
    const config = withSentryFramesCollapsed({ symbolicator: { customizeFrame: originalCustomizeFrame } });

    const customizeFrame = config.symbolicator?.customizeFrame;
    await customizeFrame?.(createMockSentryInstrumentMetroFrame());

    expect(config.symbolicator?.customizeFrame).not.toBe(originalCustomizeFrame);
    expect(originalCustomizeFrame).toHaveBeenCalledTimes(1);
  });

  test('collapses sentry instrument frames', async () => {
    const config = withSentryFramesCollapsed({});

    const customizeFrame = config.symbolicator?.customizeFrame;
    const customizedFrame = await customizeFrame?.(createMockSentryInstrumentMetroFrame());

    expect(customizedFrame?.collapse).toBe(true);
  });
});

// function create mock metro frame
function createMockSentryInstrumentMetroFrame(): MetroFrame {
  return { file: 'node_modules/@sentry/utils/cjs/instrument.js' };
}
