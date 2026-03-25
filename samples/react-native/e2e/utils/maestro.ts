import { spawn } from 'node:child_process';
import path from 'node:path';

const MAX_ATTEMPTS = 3;

const runMaestro = (test: string): Promise<void> => {
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

/**
 * Run a Maestro test with retries to handle transient failures on slow CI VMs.
 *
 * @param test - The path to the Maestro test file relative to the `e2e` directory.
 * @returns A promise that resolves when the test passes.
 */
export const maestro = async (test: string) => {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await runMaestro(test);
      return;
    } catch (error) {
      if (attempt < MAX_ATTEMPTS) {
        console.warn(`Maestro attempt ${attempt}/${MAX_ATTEMPTS} failed, retrying...`);
      } else {
        throw error;
      }
    }
  }
};
