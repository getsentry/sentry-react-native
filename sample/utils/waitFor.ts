import {expect} from '@jest/globals';

const RETRY_TIMEOUT_MS = 500;

export function waitForTruthyResult<T>(value: () => Promise<T>) {
  const promise = new Promise<T>((resolve) => {
    const interval = setInterval(async () => {
      const result = await value();
      if (result) {
        clearInterval(interval);
        resolve(result);
      }
    }, RETRY_TIMEOUT_MS);
  });

  return expect(promise);
}
