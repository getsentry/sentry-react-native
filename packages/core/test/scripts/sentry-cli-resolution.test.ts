import * as fs from 'fs';
import * as path from 'path';

const CORE_DIR = path.resolve(__dirname, '../..');
const RELATIVE_SENTRY_CLI_RESOLVER =
  "require.resolve('@sentry/cli/package.json', { paths: [require.resolve('@sentry/react-native/package.json')] })";

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
});
