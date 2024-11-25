import { describe } from '@jest/globals';

describe('CustomMask', () => {
  it('returns a react native view', () => {
    const { Mask, Unmask } = require('../../src/js/replay/CustomMask');

    expect(Mask).toBeDefined();
    expect(Unmask).toBeDefined();
  });
});
