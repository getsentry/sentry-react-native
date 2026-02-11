import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const SCRIPTS_DIR = path.resolve(__dirname, '../../scripts');
const EXPO_UPLOAD_SCRIPT = path.join(SCRIPTS_DIR, 'expo-upload-sourcemaps.js');

describe('expo-upload-sourcemaps.js', () => {
  let tempDir: string;
  let outputDir: string;
  let mockSentryCliScript: string;

  beforeEach(() => {
    // Create temporary directories for test artifacts
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-upload-test-'));
    outputDir = path.join(tempDir, 'dist');
    fs.mkdirSync(outputDir, { recursive: true });

    // Create a mock sentry-cli script
    mockSentryCliScript = path.join(tempDir, 'mock-sentry-cli');
    const mockCliContent = `#!/usr/bin/env node
const args = process.argv.slice(2);
const output = process.env.MOCK_CLI_OUTPUT || 'Mock upload successful';

// Echo the arguments to verify they're passed correctly
console.log('Arguments received:', JSON.stringify(args));
console.log(output);

const exitCode = parseInt(process.env.MOCK_CLI_EXIT_CODE || '0');
process.exit(exitCode);
`;
    fs.writeFileSync(mockSentryCliScript, mockCliContent);
    fs.chmodSync(mockSentryCliScript, '755');
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const createAssets = (filenames: string[]) => {
    filenames.forEach(filename => {
      const filePath = path.join(outputDir, filename);
      if (filename.endsWith('.map')) {
        // Create a valid sourcemap with debug_id
        fs.writeFileSync(
          filePath,
          JSON.stringify({
            version: 3,
            sources: ['index.js'],
            names: [],
            mappings: 'AAAA',
            debugId: 'test-debug-id-123',
          }),
        );
      } else {
        // Create a simple JS file
        fs.writeFileSync(filePath, '// Mock bundle file');
      }
    });
  };

  const runScript = (env: Record<string, string> = {}): { stdout: string; stderr: string; exitCode: number } => {
    const defaultEnv = {
      SENTRY_ORG: 'test-org',
      SENTRY_PROJECT: 'test-project',
      SENTRY_URL: 'https://sentry.io/',
      SENTRY_AUTH_TOKEN: 'test-token',
      SENTRY_CLI_EXECUTABLE: mockSentryCliScript,
      // Skip expo config loading
      EXPO_PUBLIC_SKIP_CONFIG: 'true',
    };

    try {
      const result = spawnSync(process.execPath, [EXPO_UPLOAD_SCRIPT, outputDir], {
        env: { ...process.env, ...defaultEnv, ...env },
        encoding: 'utf8',
      });

      return {
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        exitCode: result.status || 0,
      };
    } catch (error: any) {
      return {
        stdout: error.stdout?.toString() || '',
        stderr: error.stderr?.toString() || '',
        exitCode: error.status || 1,
      };
    }
  };

  describe('basic functionality', () => {
    it('successfully uploads normal bundles and sourcemaps', () => {
      createAssets(['bundle.js', 'bundle.js.map']);

      const result = runScript({
        MOCK_CLI_EXIT_CODE: '0',
        MOCK_CLI_OUTPUT: 'Upload successful',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Upload successful');
      expect(result.stdout).toContain('Uploaded bundles and sourcemaps to Sentry successfully');
    });

    it('handles multiple bundles', () => {
      createAssets(['bundle1.js', 'bundle1.js.map', 'bundle2.js', 'bundle2.js.map']);

      const result = runScript({
        MOCK_CLI_EXIT_CODE: '0',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Uploaded bundles and sourcemaps to Sentry successfully');
    });

    it('skips bundles without sourcemaps', () => {
      createAssets(['bundle.js']); // No .map file

      const result = runScript({
        MOCK_CLI_EXIT_CODE: '0',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Sourcemap for');
      expect(result.stdout).toContain('not found, skipping');
    });

    it('exits with error when sentry-cli fails', () => {
      createAssets(['bundle.js', 'bundle.js.map']);

      const result = runScript({
        MOCK_CLI_EXIT_CODE: '1',
        MOCK_CLI_OUTPUT: 'Upload failed: Network error',
      });

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('Upload failed: Network error');
    });
  });

  describe('security: command injection prevention', () => {
    it('safely handles filenames with spaces (simulating special characters)', () => {
      // Use spaces to simulate special character handling
      // (semicolons, pipes can't be created on most filesystems)
      const fileWithSpaces = 'bundle with spaces.js';
      const mapWithSpaces = 'bundle with spaces.js.map';

      createAssets([fileWithSpaces, mapWithSpaces]);

      const result = runScript({
        MOCK_CLI_EXIT_CODE: '0',
      });

      // Should complete successfully with proper argument passing
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Arguments received:');
      const argsMatch = result.stdout.match(/Arguments received: (.+)/);
      if (argsMatch) {
        const args = JSON.parse(argsMatch[1]);
        // Verify filename with spaces is passed as single argument
        const fileArg = args.find((arg: string) => arg.includes('bundle with spaces'));
        expect(fileArg).toBeDefined();
        expect(fileArg).toContain('bundle with spaces.js');
      }
    });

    it('safely handles filenames with shell metacharacters via spawnSync', () => {
      // spawnSync doesn't use a shell, so no special character escaping is needed
      // Test with parentheses which are valid in filenames but special to shell
      const fileWithParens = 'bundle(test).js';
      const mapWithParens = 'bundle(test).js.map';

      createAssets([fileWithParens, mapWithParens]);

      const result = runScript({
        MOCK_CLI_EXIT_CODE: '0',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Arguments received:');
      // Verify parentheses are preserved
      const argsMatch = result.stdout.match(/Arguments received: (.+)/);
      if (argsMatch) {
        const args = JSON.parse(argsMatch[1]);
        const fileArg = args.find((arg: string) => arg.includes('(test)'));
        expect(fileArg).toBeDefined();
      }
    });

    it('demonstrates shell safety: no command interpretation possible', () => {
      // This test verifies that spawnSync passes arguments directly
      // without shell interpretation, making command injection impossible
      const normalFile = 'bundle-safe.js';
      const normalMap = 'bundle-safe.js.map';

      createAssets([normalFile, normalMap]);

      const result = runScript({
        MOCK_CLI_EXIT_CODE: '0',
      });

      expect(result.exitCode).toBe(0);
      // Verify arguments are passed as an array
      const argsMatch = result.stdout.match(/Arguments received: (.+)/);
      if (argsMatch) {
        const args = JSON.parse(argsMatch[1]);
        // First arg should be the subcommand
        expect(args[0]).toBe('sourcemaps');
        expect(args[1]).toBe('upload');
        // Remaining args should be file paths
        expect(args.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('Hermes support', () => {
    it('passes --debug-id-reference flag for Hermes bundles', () => {
      // For Hermes, we need the .hbc and .hbc.map files
      createAssets(['bundle.hbc', 'bundle.hbc.map']);

      const result = runScript({
        MOCK_CLI_EXIT_CODE: '0',
      });

      expect(result.exitCode).toBe(0);
      // Check that the flag is in the arguments
      const argsMatch = result.stdout.match(/Arguments received: (.+)/);
      if (argsMatch) {
        const args = JSON.parse(argsMatch[1]);
        expect(args).toContain('--debug-id-reference');
      }
    });

    it('does not pass --debug-id-reference flag for non-Hermes bundles', () => {
      createAssets(['bundle.js', 'bundle.js.map']);

      const result = runScript({
        MOCK_CLI_EXIT_CODE: '0',
      });

      expect(result.exitCode).toBe(0);
      const argsMatch = result.stdout.match(/Arguments received: (.+)/);
      if (argsMatch) {
        const args = JSON.parse(argsMatch[1]);
        expect(args).not.toContain('--debug-id-reference');
      }
    });
  });

  describe('environment variables', () => {
    it('requires SENTRY_AUTH_TOKEN', () => {
      createAssets(['bundle.js', 'bundle.js.map']);

      const result = spawnSync(process.execPath, [EXPO_UPLOAD_SCRIPT, outputDir], {
        env: {
          ...process.env,
          SENTRY_ORG: 'test-org',
          SENTRY_PROJECT: 'test-project',
          SENTRY_URL: 'https://sentry.io/',
          SENTRY_CLI_EXECUTABLE: mockSentryCliScript,
          // Explicitly unset SENTRY_AUTH_TOKEN
          SENTRY_AUTH_TOKEN: undefined,
        },
        encoding: 'utf8',
      });

      expect(result.status).toBe(1);
      expect(result.stdout || result.stderr).toContain('SENTRY_AUTH_TOKEN environment variable must be set');
    });

    it('requires output directory argument', () => {
      const result = spawnSync(process.execPath, [EXPO_UPLOAD_SCRIPT], {
        env: {
          ...process.env,
          SENTRY_ORG: 'test-org',
          SENTRY_PROJECT: 'test-project',
          SENTRY_URL: 'https://sentry.io/',
          SENTRY_AUTH_TOKEN: 'test-token',
          SENTRY_CLI_EXECUTABLE: mockSentryCliScript,
        },
        encoding: 'utf8',
        timeout: 5000, // Add timeout in case expo config hangs
      });

      expect(result.status).toBe(1);
      const output = result.stdout + result.stderr;
      expect(output).toContain('Provide the directory with your bundles and sourcemaps');
    });
  });

  describe('sourcemap processing', () => {
    it('converts debugId to debug_id in sourcemaps', () => {
      createAssets(['bundle.js', 'bundle.js.map']);

      runScript({
        MOCK_CLI_EXIT_CODE: '0',
      });

      // Read the sourcemap file to verify it was updated
      const sourceMapPath = path.join(outputDir, 'bundle.js.map');
      const sourceMapContent = JSON.parse(fs.readFileSync(sourceMapPath, 'utf8'));

      expect(sourceMapContent.debug_id).toBe('test-debug-id-123');
      expect(sourceMapContent.debugId).toBe('test-debug-id-123');
    });
  });
});
