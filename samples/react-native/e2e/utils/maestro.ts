import { spawn } from 'node:child_process';
import path from 'node:path';

/**
 * Run a Maestro test and return a promise that resolves when the test is finished.
 *
 * @param test - The path to the Maestro test file relative to the `e2e` directory.
 * @returns A promise that resolves when the test is finished.
 */
export const maestro = async (test: string) => {
  return new Promise((resolve, reject) => {
    const process = spawn('maestro', ['test', test, '--format', 'junit'], {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
    });

    process.on('close', code => {
      if (code !== 0) {
        reject(`Maestro test failed with code ${code}. See logs above.`);
      } else {
        resolve(undefined);
      }
    });
  });
};
