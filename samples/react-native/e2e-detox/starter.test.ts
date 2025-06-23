import { describe, it, beforeAll } from '@jest/globals';
import { device, expect } from 'detox';

describe('Shows HomeScreen', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  it('Shows Bottom Tab Bar', async () => {
    await expect(element(by.text('Performance'))).toBeVisible();
  });
});
