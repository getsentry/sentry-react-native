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

  describe('dSYM wait functionality', () => {
    it('proceeds immediately when dSYM folder already exists with complete dSYM files', () => {
      // Create a complete dSYM bundle structure with DWARF binary
      const dsymPath = path.join(tempDir, 'TestApp.app.dSYM');
      const dwarfDir = path.join(dsymPath, 'Contents', 'Resources', 'DWARF');
      fs.mkdirSync(dwarfDir, { recursive: true });
      // Create a non-empty DWARF binary file
      fs.writeFileSync(path.join(dwarfDir, 'TestApp'), 'mock dwarf binary content');

      const result = runScript({
        DWARF_DSYM_FOLDER_PATH: tempDir,
        DWARF_DSYM_FILE_NAME: 'TestApp.app.dSYM',
        MOCK_CLI_EXIT_CODE: '0',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Checking for dSYM files');
      expect(result.stdout).toContain('Found');
      expect(result.stdout).toContain('dSYM bundle(s)');
      expect(result.stdout).toContain('Verified main app dSYM is complete');
      // Should not have waited since dSYM exists
      expect(result.stdout).not.toContain('Waiting');
    });

    // Note: Testing "file appears during wait" scenario is difficult with execSync
    // as it blocks the Node.js process. The wait logic is adequately covered by
    // the "proceeds immediately" and "times out" tests.

    it('times out when dSYM never appears', () => {
      const dsymFolderPath = path.join(tempDir, 'empty-dsym-folder');
      fs.mkdirSync(dsymFolderPath, { recursive: true });

      const result = runScript({
        DWARF_DSYM_FOLDER_PATH: dsymFolderPath,
        DWARF_DSYM_FILE_NAME: 'NonExistent.app.dSYM',
        SENTRY_DSYM_WAIT_MAX_ATTEMPTS: '2',
        SENTRY_DSYM_WAIT_INTERVAL: '1',
        MOCK_CLI_EXIT_CODE: '0',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Checking for dSYM files');
      expect(result.stdout).toContain('Waiting');
      expect(result.stdout).toContain('warning: Timeout waiting for dSYM files');
      expect(result.stdout).toContain('This may result in incomplete debug symbol uploads');
    });

    it('skips wait check when SENTRY_DSYM_WAIT_ENABLED=false', () => {
      const result = runScript({
        SENTRY_DSYM_WAIT_ENABLED: 'false',
        MOCK_CLI_EXIT_CODE: '0',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('SENTRY_DSYM_WAIT_ENABLED=false');
      expect(result.stdout).toContain('skipping dSYM wait check');
      expect(result.stdout).not.toContain('Checking for dSYM files');
    });

    it('proceeds when folder contains any dSYM even without DWARF_DSYM_FILE_NAME', () => {
      // Create some complete dSYM bundles
      const dsymPath1 = path.join(tempDir, 'Framework1.framework.dSYM');
      const dwarfDir1 = path.join(dsymPath1, 'Contents', 'Resources', 'DWARF');
      fs.mkdirSync(dwarfDir1, { recursive: true });
      fs.writeFileSync(path.join(dwarfDir1, 'Framework1'), 'mock dwarf content');

      const dsymPath2 = path.join(tempDir, 'Framework2.framework.dSYM');
      const dwarfDir2 = path.join(dsymPath2, 'Contents', 'Resources', 'DWARF');
      fs.mkdirSync(dwarfDir2, { recursive: true });
      fs.writeFileSync(path.join(dwarfDir2, 'Framework2'), 'mock dwarf content');

      const result = runScript({
        DWARF_DSYM_FOLDER_PATH: tempDir,
        // DWARF_DSYM_FILE_NAME not set
        MOCK_CLI_EXIT_CODE: '0',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('warning: DWARF_DSYM_FILE_NAME not set');
      expect(result.stdout).toContain('Found');
      expect(result.stdout).toContain('dSYM bundle(s)');
      expect(result.stdout).toContain('Found dSYM bundle(s) with valid DWARF content');
    });

    it('continues waiting if main app dSYM not found but other dSYMs exist', () => {
      const dsymFolderPath = path.join(tempDir, 'dsym-folder');
      fs.mkdirSync(dsymFolderPath, { recursive: true });

      // Create only framework dSYM with complete structure, not the main app dSYM
      const frameworkDsym = path.join(dsymFolderPath, 'SomeFramework.framework.dSYM');
      const frameworkDwarfDir = path.join(frameworkDsym, 'Contents', 'Resources', 'DWARF');
      fs.mkdirSync(frameworkDwarfDir, { recursive: true });
      fs.writeFileSync(path.join(frameworkDwarfDir, 'SomeFramework'), 'mock dwarf content');

      const result = runScript({
        DWARF_DSYM_FOLDER_PATH: dsymFolderPath,
        DWARF_DSYM_FILE_NAME: 'MainApp.app.dSYM', // Looking for this specific one
        SENTRY_DSYM_WAIT_MAX_ATTEMPTS: '2',
        SENTRY_DSYM_WAIT_INTERVAL: '1',
        SENTRY_DSYM_DEBUG: 'true',
        MOCK_CLI_EXIT_CODE: '0',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Main app dSYM not found yet');
      expect(result.stdout).toContain('warning: Timeout waiting for dSYM files');
    });

    it('waits when dSYM directory exists but DWARF binary is missing (incomplete)', () => {
      const dsymFolderPath = path.join(tempDir, 'incomplete-dsym-folder');
      fs.mkdirSync(dsymFolderPath, { recursive: true });

      // Create dSYM directory structure but without DWARF binary (incomplete)
      const incompleteDsym = path.join(dsymFolderPath, 'IncompleteApp.app.dSYM');
      const dwarfDir = path.join(incompleteDsym, 'Contents', 'Resources', 'DWARF');
      fs.mkdirSync(dwarfDir, { recursive: true });
      // Note: NOT creating the actual DWARF file

      const result = runScript({
        DWARF_DSYM_FOLDER_PATH: dsymFolderPath,
        DWARF_DSYM_FILE_NAME: 'IncompleteApp.app.dSYM',
        SENTRY_DSYM_WAIT_MAX_ATTEMPTS: '2',
        SENTRY_DSYM_WAIT_INTERVAL: '1',
        SENTRY_DSYM_DEBUG: 'true',
        MOCK_CLI_EXIT_CODE: '0',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Main app dSYM DWARF directory is empty');
      expect(result.stdout).toContain('warning: Timeout waiting for dSYM files');
    });

    it('waits when dSYM exists but DWARF binary is empty (still being written)', () => {
      const dsymFolderPath = path.join(tempDir, 'empty-dwarf-folder');
      fs.mkdirSync(dsymFolderPath, { recursive: true });

      // Create dSYM with empty DWARF file (simulates file being created but not written yet)
      const dsymPath = path.join(dsymFolderPath, 'WritingApp.app.dSYM');
      const dwarfDir = path.join(dsymPath, 'Contents', 'Resources', 'DWARF');
      fs.mkdirSync(dwarfDir, { recursive: true });
      fs.writeFileSync(path.join(dwarfDir, 'WritingApp'), ''); // Empty file

      const result = runScript({
        DWARF_DSYM_FOLDER_PATH: dsymFolderPath,
        DWARF_DSYM_FILE_NAME: 'WritingApp.app.dSYM',
        SENTRY_DSYM_WAIT_MAX_ATTEMPTS: '2',
        SENTRY_DSYM_WAIT_INTERVAL: '1',
        SENTRY_DSYM_DEBUG: 'true',
        MOCK_CLI_EXIT_CODE: '0',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Main app dSYM DWARF binary is empty (still being written)');
      expect(result.stdout).toContain('warning: Timeout waiting for dSYM files');
    });

    it('handles non-existent dSYM folder path', () => {
      const nonExistentPath = path.join(tempDir, 'does-not-exist');

      const result = runScript({
        DWARF_DSYM_FOLDER_PATH: nonExistentPath,
        SENTRY_DSYM_WAIT_MAX_ATTEMPTS: '2',
        SENTRY_DSYM_WAIT_INTERVAL: '1',
        SENTRY_DSYM_DEBUG: 'true',
        MOCK_CLI_EXIT_CODE: '0',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('dSYM folder does not exist yet');
      expect(result.stdout).toContain('warning: Timeout waiting for dSYM files');
    });

    it('respects custom wait interval and max attempts', () => {
      const startTime = Date.now();

      const result = runScript({
        DWARF_DSYM_FOLDER_PATH: path.join(tempDir, 'nonexistent'),
        SENTRY_DSYM_WAIT_MAX_ATTEMPTS: '3',
        SENTRY_DSYM_WAIT_INTERVAL: '1',
        MOCK_CLI_EXIT_CODE: '0',
      });

      const duration = Date.now() - startTime;

      expect(result.exitCode).toBe(0);
      // Should have waited approximately 2 seconds (3 attempts with 1s interval, but no wait after last attempt)
      expect(duration).toBeGreaterThanOrEqual(2000);
      expect(duration).toBeLessThan(4000); // Allow some margin
    });
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

  describe('SENTRY_PROJECT_ROOT override', () => {
    it('resolves SOURCEMAP_FILE relative to SENTRY_PROJECT_ROOT instead of PROJECT_DIR/..', () => {
      const customRoot = path.join(tempDir, 'monorepo-package');
      fs.mkdirSync(customRoot, { recursive: true });

      const echoScript = path.join(tempDir, 'mock-sentry-cli-echo-sourcemap.js');
      fs.writeFileSync(
        echoScript,
        `
        const sourcemapFile = process.env.SOURCEMAP_FILE || 'not-set';
        console.log('SOURCEMAP_FILE=' + sourcemapFile);
        process.exit(0);
        `,
      );

      const result = runScript({
        SENTRY_PROJECT_ROOT: customRoot,
        SENTRY_CLI_EXECUTABLE: echoScript,
        SOURCEMAP_FILE: 'relative/path.map',
      });

      const expectedPath = path.join(customRoot, 'relative/path.map');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`SOURCEMAP_FILE=${expectedPath}`);
    });

    it('resolves SOURCEMAP_FILE relative to PROJECT_DIR/.. when SENTRY_PROJECT_ROOT is not set', () => {
      const echoScript = path.join(tempDir, 'mock-sentry-cli-echo-sourcemap.js');
      fs.writeFileSync(
        echoScript,
        `
        const sourcemapFile = process.env.SOURCEMAP_FILE || 'not-set';
        console.log('SOURCEMAP_FILE=' + sourcemapFile);
        process.exit(0);
        `,
      );

      const result = runScript({
        SENTRY_CLI_EXECUTABLE: echoScript,
        SOURCEMAP_FILE: 'relative/path.map',
      });

      // Without SENTRY_PROJECT_ROOT, falls back to PROJECT_DIR/..
      const projectRoot = path.dirname(tempDir);
      const expectedPath = path.join(projectRoot, 'relative/path.map');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`SOURCEMAP_FILE=${expectedPath}`);
    });

    it('finds sentry.options.json in SENTRY_PROJECT_ROOT', () => {
      const customRoot = path.join(tempDir, 'monorepo-package');
      fs.mkdirSync(customRoot, { recursive: true });

      const optionsContent = JSON.stringify({ dsn: 'https://key@sentry.io/123' });
      fs.writeFileSync(path.join(customRoot, 'sentry.options.json'), optionsContent);

      const buildDir = path.join(tempDir, 'build');
      const resourcesPath = 'Resources';
      fs.mkdirSync(path.join(buildDir, resourcesPath), { recursive: true });

      const result = runScript({
        SENTRY_PROJECT_ROOT: customRoot,
        SENTRY_DISABLE_AUTO_UPLOAD: 'true',
        SENTRY_COPY_OPTIONS_FILE: 'true',
        CONFIGURATION_BUILD_DIR: buildDir,
        UNLOCALIZED_RESOURCES_FOLDER_PATH: resourcesPath,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Copied');
      const destPath = path.join(buildDir, resourcesPath, 'sentry.options.json');
      const copied = JSON.parse(fs.readFileSync(destPath, 'utf8'));
      expect(copied.dsn).toBe('https://key@sentry.io/123');
    });
  });

  describe('sentry.options.json environment variable overrides', () => {
    it('copies file without modification when no override env vars are set', () => {
      const optionsContent = JSON.stringify({ dsn: 'https://key@sentry.io/123', environment: 'production' });
      const optionsFile = path.join(tempDir, 'sentry.options.json');
      fs.writeFileSync(optionsFile, optionsContent);

      const buildDir = path.join(tempDir, 'build');
      const resourcesPath = 'Resources';
      fs.mkdirSync(path.join(buildDir, resourcesPath), { recursive: true });

      const result = runScript({
        SENTRY_DISABLE_AUTO_UPLOAD: 'true',
        SENTRY_COPY_OPTIONS_FILE: 'true',
        SENTRY_OPTIONS_FILE_PATH: optionsFile,
        CONFIGURATION_BUILD_DIR: buildDir,
        UNLOCALIZED_RESOURCES_FOLDER_PATH: resourcesPath,
      });

      expect(result.exitCode).toBe(0);
      const destPath = path.join(buildDir, resourcesPath, 'sentry.options.json');
      const copied = JSON.parse(fs.readFileSync(destPath, 'utf8'));
      expect(copied.dsn).toBe('https://key@sentry.io/123');
      expect(copied.environment).toBe('production');
    });

    it('overrides environment from SENTRY_ENVIRONMENT env var', () => {
      const optionsContent = JSON.stringify({ dsn: 'https://key@sentry.io/123', environment: 'production' });
      const optionsFile = path.join(tempDir, 'sentry.options.json');
      fs.writeFileSync(optionsFile, optionsContent);

      const buildDir = path.join(tempDir, 'build');
      const resourcesPath = 'Resources';
      fs.mkdirSync(path.join(buildDir, resourcesPath), { recursive: true });

      const result = runScript({
        SENTRY_DISABLE_AUTO_UPLOAD: 'true',
        SENTRY_COPY_OPTIONS_FILE: 'true',
        SENTRY_OPTIONS_FILE_PATH: optionsFile,
        CONFIGURATION_BUILD_DIR: buildDir,
        UNLOCALIZED_RESOURCES_FOLDER_PATH: resourcesPath,
        SENTRY_ENVIRONMENT: 'staging',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Overriding 'environment' from SENTRY_ENVIRONMENT");
      const destPath = path.join(buildDir, resourcesPath, 'sentry.options.json');
      const copied = JSON.parse(fs.readFileSync(destPath, 'utf8'));
      expect(copied.environment).toBe('staging');
      expect(copied.dsn).toBe('https://key@sentry.io/123');
    });

    it('overrides release from SENTRY_RELEASE env var', () => {
      const optionsContent = JSON.stringify({ dsn: 'https://key@sentry.io/123' });
      const optionsFile = path.join(tempDir, 'sentry.options.json');
      fs.writeFileSync(optionsFile, optionsContent);

      const buildDir = path.join(tempDir, 'build');
      const resourcesPath = 'Resources';
      fs.mkdirSync(path.join(buildDir, resourcesPath), { recursive: true });

      const result = runScript({
        SENTRY_DISABLE_AUTO_UPLOAD: 'true',
        SENTRY_COPY_OPTIONS_FILE: 'true',
        SENTRY_OPTIONS_FILE_PATH: optionsFile,
        CONFIGURATION_BUILD_DIR: buildDir,
        UNLOCALIZED_RESOURCES_FOLDER_PATH: resourcesPath,
        SENTRY_RELEASE: 'my-app@1.0.0+42',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Overriding 'release' from SENTRY_RELEASE");
      const destPath = path.join(buildDir, resourcesPath, 'sentry.options.json');
      const copied = JSON.parse(fs.readFileSync(destPath, 'utf8'));
      expect(copied.release).toBe('my-app@1.0.0+42');
      expect(copied.dsn).toBe('https://key@sentry.io/123');
    });

    it('overrides existing release value from SENTRY_RELEASE env var', () => {
      const optionsContent = JSON.stringify({ dsn: 'https://key@sentry.io/123', release: 'old@1.0.0', dist: '1' });
      const optionsFile = path.join(tempDir, 'sentry.options.json');
      fs.writeFileSync(optionsFile, optionsContent);

      const buildDir = path.join(tempDir, 'build');
      const resourcesPath = 'Resources';
      fs.mkdirSync(path.join(buildDir, resourcesPath), { recursive: true });

      const result = runScript({
        SENTRY_DISABLE_AUTO_UPLOAD: 'true',
        SENTRY_COPY_OPTIONS_FILE: 'true',
        SENTRY_OPTIONS_FILE_PATH: optionsFile,
        CONFIGURATION_BUILD_DIR: buildDir,
        UNLOCALIZED_RESOURCES_FOLDER_PATH: resourcesPath,
        SENTRY_RELEASE: 'new@2.0.0',
        SENTRY_DIST: '2',
      });

      expect(result.exitCode).toBe(0);
      const destPath = path.join(buildDir, resourcesPath, 'sentry.options.json');
      const copied = JSON.parse(fs.readFileSync(destPath, 'utf8'));
      expect(copied.release).toBe('new@2.0.0');
      expect(copied.dist).toBe('2');
    });

    it('overrides dist from SENTRY_DIST env var', () => {
      const optionsContent = JSON.stringify({ dsn: 'https://key@sentry.io/123' });
      const optionsFile = path.join(tempDir, 'sentry.options.json');
      fs.writeFileSync(optionsFile, optionsContent);

      const buildDir = path.join(tempDir, 'build');
      const resourcesPath = 'Resources';
      fs.mkdirSync(path.join(buildDir, resourcesPath), { recursive: true });

      const result = runScript({
        SENTRY_DISABLE_AUTO_UPLOAD: 'true',
        SENTRY_COPY_OPTIONS_FILE: 'true',
        SENTRY_OPTIONS_FILE_PATH: optionsFile,
        CONFIGURATION_BUILD_DIR: buildDir,
        UNLOCALIZED_RESOURCES_FOLDER_PATH: resourcesPath,
        SENTRY_DIST: '42',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Overriding 'dist' from SENTRY_DIST");
      const destPath = path.join(buildDir, resourcesPath, 'sentry.options.json');
      const copied = JSON.parse(fs.readFileSync(destPath, 'utf8'));
      expect(copied.dist).toBe('42');
      expect(copied.dsn).toBe('https://key@sentry.io/123');
    });

    it('overrides release, dist, and environment together', () => {
      const optionsContent = JSON.stringify({ dsn: 'https://key@sentry.io/123', environment: 'production' });
      const optionsFile = path.join(tempDir, 'sentry.options.json');
      fs.writeFileSync(optionsFile, optionsContent);

      const buildDir = path.join(tempDir, 'build');
      const resourcesPath = 'Resources';
      fs.mkdirSync(path.join(buildDir, resourcesPath), { recursive: true });

      const result = runScript({
        SENTRY_DISABLE_AUTO_UPLOAD: 'true',
        SENTRY_COPY_OPTIONS_FILE: 'true',
        SENTRY_OPTIONS_FILE_PATH: optionsFile,
        CONFIGURATION_BUILD_DIR: buildDir,
        UNLOCALIZED_RESOURCES_FOLDER_PATH: resourcesPath,
        SENTRY_ENVIRONMENT: 'staging',
        SENTRY_RELEASE: 'my-app@2.0.0+10',
        SENTRY_DIST: '10',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Overriding 'environment' from SENTRY_ENVIRONMENT");
      expect(result.stdout).toContain("Overriding 'release' from SENTRY_RELEASE");
      expect(result.stdout).toContain("Overriding 'dist' from SENTRY_DIST");
      const destPath = path.join(buildDir, resourcesPath, 'sentry.options.json');
      const copied = JSON.parse(fs.readFileSync(destPath, 'utf8'));
      expect(copied.environment).toBe('staging');
      expect(copied.release).toBe('my-app@2.0.0+10');
      expect(copied.dist).toBe('10');
    });

    it('does not modify the source file when overriding', () => {
      const optionsContent = JSON.stringify({
        dsn: 'https://key@sentry.io/123',
        release: 'original@1.0.0',
        environment: 'production',
      });
      const optionsFile = path.join(tempDir, 'sentry.options.json');
      fs.writeFileSync(optionsFile, optionsContent);

      const buildDir = path.join(tempDir, 'build');
      const resourcesPath = 'Resources';
      fs.mkdirSync(path.join(buildDir, resourcesPath), { recursive: true });

      runScript({
        SENTRY_DISABLE_AUTO_UPLOAD: 'true',
        SENTRY_COPY_OPTIONS_FILE: 'true',
        SENTRY_OPTIONS_FILE_PATH: optionsFile,
        CONFIGURATION_BUILD_DIR: buildDir,
        UNLOCALIZED_RESOURCES_FOLDER_PATH: resourcesPath,
        SENTRY_ENVIRONMENT: 'staging',
        SENTRY_RELEASE: 'override@2.0.0',
        SENTRY_DIST: '99',
      });

      const source = JSON.parse(fs.readFileSync(optionsFile, 'utf8'));
      expect(source.environment).toBe('production');
      expect(source.release).toBe('original@1.0.0');
      expect(source.dist).toBeUndefined();
    });

    it('falls back to plain copy when sentry.options.json contains invalid JSON', () => {
      const optionsFile = path.join(tempDir, 'sentry.options.json');
      fs.writeFileSync(optionsFile, 'invalid json{{{');

      const buildDir = path.join(tempDir, 'build');
      const resourcesPath = 'Resources';
      fs.mkdirSync(path.join(buildDir, resourcesPath), { recursive: true });

      const result = runScript({
        SENTRY_DISABLE_AUTO_UPLOAD: 'true',
        SENTRY_COPY_OPTIONS_FILE: 'true',
        SENTRY_OPTIONS_FILE_PATH: optionsFile,
        CONFIGURATION_BUILD_DIR: buildDir,
        UNLOCALIZED_RESOURCES_FOLDER_PATH: resourcesPath,
        SENTRY_RELEASE: 'my-app@1.0.0',
      });

      expect(result.exitCode).toBe(0);
      const destPath = path.join(buildDir, resourcesPath, 'sentry.options.json');
      expect(fs.readFileSync(destPath, 'utf8')).toBe('invalid json{{{');
      expect(result.stdout).toContain('Copied');
    });
  });

  describe('SOURCEMAP_FILE path resolution', () => {
    // Returns a mock sentry-cli that prints the SOURCEMAP_FILE env var it received.
    const makeSourcemapEchoScript = (dir: string): string => {
      const scriptPath = path.join(dir, 'mock-sentry-cli-echo-sourcemap.js');
      fs.writeFileSync(
        scriptPath,
        `
        const sourcemapFile = process.env.SOURCEMAP_FILE || 'not-set';
        console.log('SOURCEMAP_FILE=' + sourcemapFile);
        process.exit(0);
        `,
      );
      return scriptPath;
    };

    it('leaves an absolute SOURCEMAP_FILE unchanged', () => {
      const absolutePath = path.join(tempDir, 'absolute', 'main.jsbundle.map');
      const echoScript = makeSourcemapEchoScript(tempDir);

      const result = runScript({
        SENTRY_CLI_EXECUTABLE: echoScript,
        SOURCEMAP_FILE: absolutePath,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`SOURCEMAP_FILE=${absolutePath}`);
    });

    it('resolves a relative SOURCEMAP_FILE against the project root, not ios/', () => {
      // PROJECT_DIR is tempDir (simulates the ios/ folder).
      // RN_PROJECT_ROOT = PROJECT_DIR/.. = parent of tempDir.
      // A user setting SOURCEMAP_FILE=relative/path.map expects it relative to the project root.
      const echoScript = makeSourcemapEchoScript(tempDir);

      const result = runScript({
        SENTRY_CLI_EXECUTABLE: echoScript,
        SOURCEMAP_FILE: 'relative/path.map',
      });

      const projectRoot = path.dirname(tempDir); // PROJECT_DIR/.. = RN_PROJECT_ROOT
      const expectedPath = path.join(projectRoot, 'relative/path.map');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`SOURCEMAP_FILE=${expectedPath}`);
    });

    it('resolves a ./prefixed SOURCEMAP_FILE against the project root', () => {
      const echoScript = makeSourcemapEchoScript(tempDir);

      const result = runScript({
        SENTRY_CLI_EXECUTABLE: echoScript,
        SOURCEMAP_FILE: './maps/main.jsbundle.map',
      });

      // The leading ./ is stripped via ${SOURCEMAP_FILE#./} before concatenation,
      // so the result is a clean absolute path without any ./ component.
      const projectRoot = path.dirname(tempDir);
      const expectedPath = path.join(projectRoot, 'maps/main.jsbundle.map');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`SOURCEMAP_FILE=${expectedPath}`);
    });

    it('uses the absolute default SOURCEMAP_FILE when not set by the user', () => {
      const echoScript = makeSourcemapEchoScript(tempDir);

      const result = runScript({
        SENTRY_CLI_EXECUTABLE: echoScript,
        // SOURCEMAP_FILE intentionally not set — script should default to $DERIVED_FILE_DIR/main.jsbundle.map
        DERIVED_FILE_DIR: tempDir,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`SOURCEMAP_FILE=${tempDir}/main.jsbundle.map`);
    });
  });
});
