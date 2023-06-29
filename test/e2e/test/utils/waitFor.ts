/* eslint-disable import/no-unresolved */
import { expect } from '@jest/globals';

const RETRY_TIMEOUT_MS = 1000;
const FINAL_TIMEOUT_MS = 1 * 60 * 1000;

export async function waitForTruthyResult<T>(value: () => Promise<T>): Promise<void> {
  const promise = new Promise<T>((resolve, reject) => {
    // eslint-disable-next-line prefer-const
    let timeout: NodeJS.Timeout;
    // eslint-disable-next-line prefer-const
    let interval: NodeJS.Timer;

    // eslint-disable-next-line prefer-const
    interval = setInterval(async () => {
      const result = await value();
      if (result) {
        clearInterval(interval);
        clearTimeout(timeout);
        resolve(result);
      }
    }, RETRY_TIMEOUT_MS);

    // eslint-disable-next-line prefer-const
    timeout = setTimeout(() => {
      clearInterval(interval);
      reject(new Error(`waitForTruthyResult function timed out after ${FINAL_TIMEOUT_MS} ms`));
    }, FINAL_TIMEOUT_MS);
  });

  await expect(promise).resolves.toBeTruthy();
}
