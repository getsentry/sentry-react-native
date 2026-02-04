import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const SCRIPTS_DIR = path.resolve(__dirname, '../../scripts');
const DEBUG_FILES_SCRIPT = path.join(SCRIPTS_DIR, 'sentry-xcode-debug-files.sh');
const XCODE_SCRIPT = path.join(SCRIPTS_DIR, 'sentry-xcode.sh');

describe('sentry-xcode-debug-files.sh', () => {
  let tempDir: string;
  let mockSentryCliScript: string;

  beforeEach(() => {
    // Create a temporary directory for test artifacts
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-xcode-test-'));

    // Create a mock sentry-cli script that can simulate success or failure
    mockSentryCliScript = path.join(tempDir, 'mock-sentry-cli.js');
    fs.writeFileSync(
      mockSentryCliScript,
      `
      const exitCode = process.env.MOCK_CLI_EXIT_CODE || '0';
      const output = process.env.MOCK_CLI_OUTPUT || 'Mock upload output';
      console.log(output);
      process.exit(parseInt(exitCode));
      `,
    );
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const runScript = (env: Record<string, string> = {}): { stdout: string; stderr: string; exitCode: number } => {
    const defaultEnv = {
      NODE_BINARY: process.execPath,
      SENTRY_CLI_EXECUTABLE: mockSentryCliScript,
      DWARF_DSYM_FOLDER_PATH: tempDir,
      CONFIGURATION: 'Release',
      PROJECT_DIR: tempDir,
      DERIVED_FILE_DIR: tempDir,
    };

    try {
      const stdout = execSync(`bash "${DEBUG_FILES_SCRIPT}"`, {
        env: { ...process.env, ...defaultEnv, ...env },
        encoding: 'utf8',
        stdio: 'pipe',
      });
      return { stdout, stderr: '', exitCode: 0 };
    } catch (error: any) {
      return {
        stdout: error.stdout?.toString() || '',
        stderr: error.stderr?.toString() || '',
        exitCode: error.status || 1,
      };
    }
  };

  it('exits with 0 when upload succeeds', () => {
    const result = runScript({
      MOCK_CLI_EXIT_CODE: '0',
      MOCK_CLI_OUTPUT: 'Upload successful',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Upload successful');
  });

  it('exits with 0 when SENTRY_ALLOW_FAILURE=true and upload fails', () => {
    const result = runScript({
      MOCK_CLI_EXIT_CODE: '1',
      MOCK_CLI_OUTPUT: 'Upload failed: API error',
      SENTRY_ALLOW_FAILURE: 'true',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('warning: sentry-cli');
    expect(result.stdout).toContain('continuing build because SENTRY_ALLOW_FAILURE=true');
    expect(result.stdout).toContain('Upload failed: API error');
  });

  it('exits with 0 but prints error when SENTRY_ALLOW_FAILURE not set and upload fails', () => {
    const result = runScript({
      MOCK_CLI_EXIT_CODE: '1',
      MOCK_CLI_OUTPUT: 'Upload failed: API error',
    });

    // Original behavior: script exits 0, but Xcode fails build due to "error:" prefix
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('error: sentry-cli');
    expect(result.stdout).toContain('SENTRY_ALLOW_FAILURE=true');
    expect(result.stdout).toContain('Upload failed: API error');
  });

  it('exits with 0 but prints error when SENTRY_ALLOW_FAILURE=false and upload fails', () => {
    const result = runScript({
      MOCK_CLI_EXIT_CODE: '1',
      MOCK_CLI_OUTPUT: 'Upload failed: Network error',
      SENTRY_ALLOW_FAILURE: 'false',
    });

    // Original behavior: script exits 0, but Xcode fails build due to "error:" prefix
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('error: sentry-cli');
  });

  it('skips upload when SENTRY_DISABLE_AUTO_UPLOAD=true', () => {
    const result = runScript({
      SENTRY_DISABLE_AUTO_UPLOAD: 'true',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('SENTRY_DISABLE_AUTO_UPLOAD=true');
    expect(result.stdout).toContain('skipping debug files upload');
  });

  it('skips upload for Debug configuration', () => {
    const result = runScript({
      CONFIGURATION: 'Debug',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Skipping debug files upload for *Debug* configuration');
  });

  it('skips upload for debug configuration (case insensitive)', () => {
    const result = runScript({
      CONFIGURATION: 'debug',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Skipping debug files upload for *Debug* configuration');
  });
});

describe('sentry-xcode.sh', () => {
  let tempDir: string;
  let mockSentryCliScript: string;
  let mockReactNativeScript: string;

  beforeEach(() => {
    // Create a temporary directory for test artifacts
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-xcode-test-'));

    // Create a mock sentry-cli script
    mockSentryCliScript = path.join(tempDir, 'mock-sentry-cli.js');
    fs.writeFileSync(
      mockSentryCliScript,
      `
      const exitCode = process.env.MOCK_CLI_EXIT_CODE || '0';
      const output = process.env.MOCK_CLI_OUTPUT || 'Mock upload output';
      console.log(output);
      process.exit(parseInt(exitCode));
      `,
    );

    // Create a mock react-native-xcode.sh script
    mockReactNativeScript = path.join(tempDir, 'react-native-xcode.sh');
    fs.writeFileSync(
      mockReactNativeScript,
      `#!/bin/bash
      echo "Mock React Native bundle"
      exit 0
      `,
    );
    fs.chmodSync(mockReactNativeScript, '755');
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const runScript = (env: Record<string, string> = {}): { stdout: string; stderr: string; exitCode: number } => {
    // Create a mock collect-modules.sh script to prevent script failure
    const mockCollectModulesScript = path.join(tempDir, 'collect-modules.sh');
    fs.writeFileSync(mockCollectModulesScript, '#!/bin/bash\nexit 0\n');
    fs.chmodSync(mockCollectModulesScript, '755');

    const defaultEnv = {
      NODE_BINARY: process.execPath,
      SENTRY_CLI_EXECUTABLE: mockSentryCliScript,
      PROJECT_DIR: tempDir,
      DERIVED_FILE_DIR: tempDir,
      SENTRY_COLLECT_MODULES: mockCollectModulesScript, // Set this to avoid package resolution failure
    };

    try {
      const stdout = execSync(`bash "${XCODE_SCRIPT}" "${mockReactNativeScript}"`, {
        env: { ...process.env, ...defaultEnv, ...env },
        encoding: 'utf8',
        stdio: 'pipe',
      });
      return { stdout, stderr: '', exitCode: 0 };
    } catch (error: any) {
      return {
        stdout: error.stdout?.toString() || '',
        stderr: error.stderr?.toString() || '',
        exitCode: error.status || 1,
      };
    }
  };

  it('exits with 0 when upload succeeds', () => {
    const result = runScript({
      MOCK_CLI_EXIT_CODE: '0',
      MOCK_CLI_OUTPUT: 'Source maps uploaded successfully',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Source maps uploaded successfully');
  });

  it('exits with 0 when SENTRY_ALLOW_FAILURE=true and upload fails', () => {
    const result = runScript({
      MOCK_CLI_EXIT_CODE: '1',
      MOCK_CLI_OUTPUT: 'Upload failed: Connection timeout',
      SENTRY_ALLOW_FAILURE: 'true',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('warning: sentry-cli');
    expect(result.stdout).toContain('continuing build because SENTRY_ALLOW_FAILURE=true');
    expect(result.stdout).toContain('Upload failed: Connection timeout');
  });

  it('exits with 1 when SENTRY_ALLOW_FAILURE not set and upload fails', () => {
    const result = runScript({
      MOCK_CLI_EXIT_CODE: '1',
      MOCK_CLI_OUTPUT: 'Upload failed: Invalid auth token',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('error: sentry-cli');
    expect(result.stdout).toContain('SENTRY_ALLOW_FAILURE=true');
    expect(result.stdout).toContain('Upload failed: Invalid auth token');
  });

  it('exits with 1 when SENTRY_ALLOW_FAILURE=false and upload fails', () => {
    const result = runScript({
      MOCK_CLI_EXIT_CODE: '1',
      MOCK_CLI_OUTPUT: 'Upload failed',
      SENTRY_ALLOW_FAILURE: 'false',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('error: sentry-cli');
  });

  it('skips upload when SENTRY_DISABLE_AUTO_UPLOAD=true', () => {
    const result = runScript({
      SENTRY_DISABLE_AUTO_UPLOAD: 'true',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('SENTRY_DISABLE_AUTO_UPLOAD=true');
    expect(result.stdout).toContain('skipping sourcemaps upload');
  });
});
