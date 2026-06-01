import * as fs from 'fs';
import * as path from 'path';

const CORE_DIR = path.resolve(__dirname, '../..');
const EXPO_UPLOAD_SOURCEMAPS_DIR = path.resolve(CORE_DIR, '../expo-upload-sourcemaps');
const RELATIVE_SENTRY_CLI_RESOLVER =
  "require.resolve('@sentry/cli/package.json', { paths: [require.resolve('@sentry/react-native/package.json')] })";
const RELATIVE_EXPO_UPLOAD_SOURCEMAPS_CLI_RESOLVER_PATH =
  "paths: [require.resolve('@sentry/expo-upload-sourcemaps/package.json')]";

describe('sentry-cli resolution', () => {
  it('resolves @sentry/cli relative to @sentry/react-native on Android', () => {
    const gradleScript = fs.readFileSync(path.join(CORE_DIR, 'sentry.gradle.kts'), 'utf8');

    expect(gradleScript).toContain(RELATIVE_SENTRY_CLI_RESOLVER);
  });

  it('resolves @sentry/cli relative to @sentry/react-native on iOS', () => {
    const xcodeScript = fs.readFileSync(path.join(CORE_DIR, 'scripts', 'sentry-xcode.sh'), 'utf8');
    const xcodeDebugFilesScript = fs.readFileSync(
      path.join(CORE_DIR, 'scripts', 'sentry-xcode-debug-files.sh'),
      'utf8',
    );

    expect(xcodeScript).toContain(RELATIVE_SENTRY_CLI_RESOLVER);
    expect(xcodeDebugFilesScript).toContain(RELATIVE_SENTRY_CLI_RESOLVER);
  });

  it('resolves @sentry/cli relative to @sentry/expo-upload-sourcemaps in the Expo uploader', () => {
    const expoUploadSourcemapsScript = fs.readFileSync(
      path.join(EXPO_UPLOAD_SOURCEMAPS_DIR, 'cli.js'),
      'utf8',
    );

    expect(expoUploadSourcemapsScript).toContain("require.resolve('@sentry/cli/bin/sentry-cli'");
    expect(expoUploadSourcemapsScript).toContain(RELATIVE_EXPO_UPLOAD_SOURCEMAPS_CLI_RESOLVER_PATH);
  });
});
