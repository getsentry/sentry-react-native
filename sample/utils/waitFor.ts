import {expect} from '@jest/globals';

const RETRY_TIMEOUT_MS = 500;
const FINAL_TIMEOUT_MS = 1 * 60 * 1000;

export function waitForTruthyResult<T>(value: () => Promise<T>) {
  const promise = new Promise<T>((resolve, reject) => {
    let timeout: NodeJS.Timeout;
    let interval: NodeJS.Timer;

    interval = setInterval(async () => {
      const result = await value();
      if (result) {
        clearInterval(interval);
        clearTimeout(timeout);
        resolve(result);
      }
    }, RETRY_TIMEOUT_MS);

    timeout = setTimeout(() => {
      clearInterval(interval);
      reject(new Error(`waitForTruthyResult function timed out after ${FINAL_TIMEOUT_MS} ms`));
    }, FINAL_TIMEOUT_MS);
  });

  return expect(promise);
}
