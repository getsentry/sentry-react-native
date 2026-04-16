import * as fs from 'fs';

import { checkSentryExpoNativeProject } from '../../src/js/tools/sentryExpoNativeCheck';

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  readdirSync: jest.fn(),
}));

const existsSyncMock = fs.existsSync as jest.Mock;
const readFileSyncMock = fs.readFileSync as jest.Mock;
const readdirSyncMock = fs.readdirSync as jest.Mock;

const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

const PACKAGE_JSON_WITH_EXPO = JSON.stringify({
  dependencies: { expo: '~52.0.0', '@sentry/react-native': '6.0.0' },
});

const PACKAGE_JSON_WITH_EXPO_DEV = JSON.stringify({
  devDependencies: { expo: '~52.0.0' },
});

const PACKAGE_JSON_WITHOUT_EXPO = JSON.stringify({
  dependencies: { 'react-native': '0.76.0' },
});

const PBXPROJ_WITH_SENTRY_XCODE = `
  shellScript = "/bin/sh \`\\"$NODE_BINARY\\" --print \\"require('path').dirname(require.resolve('@sentry/react-native/package.json')) + '/scripts/sentry-xcode.sh'\\"\`"
`;

const PBXPROJ_WITH_UPLOAD_DEBUG_SYMBOLS = `
  name = "Upload Debug Symbols to Sentry";
  shellScript = "/bin/sh sentry-xcode-debug-files.sh";
`;

const PBXPROJ_WITHOUT_SENTRY = `
  shellScript = "set -e\\n\\nWITH_ENVIRONMENT=\\"../node_modules/react-native/scripts/xcode/with-environment.sh\\"\\nREACT_NATIVE_XCODE=\\"../node_modules/react-native/scripts/react-native-xcode.sh\\"\\n\\n/bin/sh -c \\"$WITH_ENVIRONMENT $REACT_NATIVE_XCODE\\"\\n";
`;

const BUILD_GRADLE_WITH_SENTRY = `
apply from: new File(["node", "--print", "require('path').dirname(require.resolve('@sentry/react-native/package.json'))"].execute().text.trim(), "sentry.gradle")

android {
}
`;

const BUILD_GRADLE_WITHOUT_SENTRY = `
android {
}
`;

describe('checkSentryExpoNativeProject', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    consoleWarnSpy.mockImplementation();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('skips check for non-Expo projects', () => {
    test('no package.json', () => {
      existsSyncMock.mockReturnValue(false);

      checkSentryExpoNativeProject('/project');

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    test('package.json without expo dependency', () => {
      mockFilesystem({
        '/project/package.json': PACKAGE_JSON_WITHOUT_EXPO,
      });

      checkSentryExpoNativeProject('/project');

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('no warning when native dirs do not exist', () => {
    test('no ios/ or android/ directories', () => {
      mockFilesystem({
        '/project/package.json': PACKAGE_JSON_WITH_EXPO,
      });

      checkSentryExpoNativeProject('/project');

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('no warning when Sentry is configured', () => {
    test('iOS with sentry-xcode in pbxproj', () => {
      mockFilesystem({
        '/project/package.json': PACKAGE_JSON_WITH_EXPO,
        '/project/ios': { dir: true, entries: ['MyApp.xcodeproj'] },
        '/project/ios/MyApp.xcodeproj/project.pbxproj': PBXPROJ_WITH_SENTRY_XCODE,
        '/project/android/app/build.gradle': BUILD_GRADLE_WITH_SENTRY,
      });

      checkSentryExpoNativeProject('/project');

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    test('iOS with Upload Debug Symbols in pbxproj', () => {
      mockFilesystem({
        '/project/package.json': PACKAGE_JSON_WITH_EXPO,
        '/project/ios': { dir: true, entries: ['MyApp.xcodeproj'] },
        '/project/ios/MyApp.xcodeproj/project.pbxproj': PBXPROJ_WITH_UPLOAD_DEBUG_SYMBOLS,
        '/project/android/app/build.gradle': BUILD_GRADLE_WITH_SENTRY,
      });

      checkSentryExpoNativeProject('/project');

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    test('Android with sentry.gradle in build.gradle', () => {
      mockFilesystem({
        '/project/package.json': PACKAGE_JSON_WITH_EXPO,
        '/project/android/app/build.gradle': BUILD_GRADLE_WITH_SENTRY,
      });

      checkSentryExpoNativeProject('/project');

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('warns when Sentry is missing', () => {
    test('iOS missing Sentry config', () => {
      mockFilesystem({
        '/project/package.json': PACKAGE_JSON_WITH_EXPO,
        '/project/ios': { dir: true, entries: ['MyApp.xcodeproj'] },
        '/project/ios/MyApp.xcodeproj/project.pbxproj': PBXPROJ_WITHOUT_SENTRY,
        '/project/android/app/build.gradle': BUILD_GRADLE_WITH_SENTRY,
      });

      checkSentryExpoNativeProject('/project');

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('iOS'));
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('npx expo prebuild --clean'));
    });

    test('Android missing Sentry config', () => {
      mockFilesystem({
        '/project/package.json': PACKAGE_JSON_WITH_EXPO,
        '/project/android/app/build.gradle': BUILD_GRADLE_WITHOUT_SENTRY,
      });

      checkSentryExpoNativeProject('/project');

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Android'));
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('npx expo prebuild --clean'));
    });

    test('both platforms missing Sentry config', () => {
      mockFilesystem({
        '/project/package.json': PACKAGE_JSON_WITH_EXPO,
        '/project/ios': { dir: true, entries: ['MyApp.xcodeproj'] },
        '/project/ios/MyApp.xcodeproj/project.pbxproj': PBXPROJ_WITHOUT_SENTRY,
        '/project/android/app/build.gradle': BUILD_GRADLE_WITHOUT_SENTRY,
      });

      checkSentryExpoNativeProject('/project');

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('iOS and Android'));
    });
  });

  describe('detects expo in devDependencies', () => {
    test('warns when expo is in devDependencies and native config is missing', () => {
      mockFilesystem({
        '/project/package.json': PACKAGE_JSON_WITH_EXPO_DEV,
        '/project/android/app/build.gradle': BUILD_GRADLE_WITHOUT_SENTRY,
      });

      checkSentryExpoNativeProject('/project');

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('graceful error handling', () => {
    test('does not crash when fs throws', () => {
      existsSyncMock.mockImplementation(() => {
        throw new Error('permission denied');
      });

      expect(() => checkSentryExpoNativeProject('/project')).not.toThrow();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    test('does not crash when package.json is invalid JSON', () => {
      mockFilesystem({
        '/project/package.json': 'not json{{{',
      });

      expect(() => checkSentryExpoNativeProject('/project')).not.toThrow();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    test('no warning when ios/ exists but has no xcodeproj', () => {
      mockFilesystem({
        '/project/package.json': PACKAGE_JSON_WITH_EXPO,
        '/project/ios': { dir: true, entries: ['Podfile', 'Pods'] },
      });

      checkSentryExpoNativeProject('/project');

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });
});

type FilesystemMap = Record<string, string | { dir: true; entries: string[] }>;

/**
 * Sets up existsSync, readFileSync, and readdirSync mocks based on a virtual filesystem map.
 */
function mockFilesystem(files: FilesystemMap): void {
  const resolvedFiles = new Map<string, string | { dir: true; entries: string[] }>();
  for (const [key, value] of Object.entries(files)) {
    // path.resolve normalizes the path for the current OS
    resolvedFiles.set(require('path').resolve(key), value);
  }

  existsSyncMock.mockImplementation((p: string) => resolvedFiles.has(require('path').resolve(p)));

  readFileSyncMock.mockImplementation((p: string) => {
    const resolved = require('path').resolve(p);
    const entry = resolvedFiles.get(resolved);
    if (typeof entry === 'string') {
      return entry;
    }
    throw new Error(`ENOENT: no such file or directory, open '${p}'`);
  });

  readdirSyncMock.mockImplementation((p: string) => {
    const resolved = require('path').resolve(p);
    const entry = resolvedFiles.get(resolved);
    if (entry && typeof entry === 'object' && entry.dir) {
      return entry.entries;
    }
    throw new Error(`ENOENT: no such file or directory, scandir '${p}'`);
  });
}
