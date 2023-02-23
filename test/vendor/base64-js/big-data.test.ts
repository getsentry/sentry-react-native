// https://github.dev/beatgammit/base64-js/blob/88957c9943c7e2a0f03cdf73e71d579e433627d3/test/big-data.js#L4
// License: MIT

import { fromByteArray } from '../../../src/js/vendor'

describe('base64-js', () => {
  test('convert big data to base64', () => {
    const SIZE_2MB = 2e6; // scaled down from original 64MiB
    const big = new Uint8Array(SIZE_2MB);
    for (let i = 0, length = big.length; i < length; ++i) {
      big[i] = i % 256
    }
    const b64str = fromByteArray(big)
    const arr = Uint8Array.from(Buffer.from(b64str, 'base64'))
    expect(arr).toEqual(big)
  })
});
