const fs = require('fs');
const path = require('path');
const https = require('https');

const GRADLE_PLUGIN_FILE = 'packages/core/plugin/src/withSentryAndroidGradlePlugin.ts';
const BUILD_GRADLE_FILE = 'packages/core/android/build.gradle';

const createSectionWarning = (title, content, icon = '❌') => {
  return `### ${icon} ${title}\n\n${content}\n`;
};

/**
 * Fetches the SDK version from gradle.properties in the gradle plugin GitHub repo.
 * The file contains a line like: sdk_version = X.Y.Z
 */
function fetchBundledSentryAndroidVersion(gradlePluginVersion) {
  return new Promise((resolve, reject) => {
    const url = `https://raw.githubusercontent.com/getsentry/sentry-android-gradle-plugin/${gradlePluginVersion}/plugin-build/gradle.properties`;

    https
      .get(url, res => {
        if (res.statusCode !== 200) {
          reject(new Error(`Could not fetch gradle.properties for version ${gradlePluginVersion}`));
          return;
        }

        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          // Look for: sdk_version = X.Y.Z
          const versionMatch = data.match(/sdk_version\s*=\s*(\S+)/);
          if (versionMatch) {
            resolve(versionMatch[1]);
          } else {
            reject(new Error(`Could not find sdk_version in gradle.properties`));
          }
        });
      })
      .on('error', reject);
  });
}

module.exports = async function ({ fail, warn, __, ___, danger }) {
  const gradlePluginFileChanged = danger.git.modified_files.includes(GRADLE_PLUGIN_FILE);
  const buildGradleFileChanged = danger.git.modified_files.includes(BUILD_GRADLE_FILE);

  if (!gradlePluginFileChanged && !buildGradleFileChanged) {
    console.log('Neither gradle plugin config nor build.gradle changed, skipping check.');
    return;
  }

  console.log('Running Android SDK version mismatch check...');

  // Read gradle plugin version from withSentryAndroidGradlePlugin.ts
  const gradlePluginFilePath = path.join(process.cwd(), GRADLE_PLUGIN_FILE);
  if (!fs.existsSync(gradlePluginFilePath)) {
    console.log(`File not found: ${GRADLE_PLUGIN_FILE}`);
    return;
  }

  const gradlePluginFileContent = fs.readFileSync(gradlePluginFilePath, 'utf8');
  const gradlePluginVersionMatch = gradlePluginFileContent.match(
    /export\s+const\s+sentryAndroidGradlePluginVersion\s*=\s*['"]([^'"]+)['"]/,
  );

  if (!gradlePluginVersionMatch) {
    warn(
      createSectionWarning(
        'Android SDK Version Check',
        'Could not parse `sentryAndroidGradlePluginVersion` from withSentryAndroidGradlePlugin.ts',
        '⚠️',
      ),
    );
    return;
  }

  const gradlePluginVersion = gradlePluginVersionMatch[1];
  console.log(`Gradle plugin version: ${gradlePluginVersion}`);

  // Read sentry-android version from build.gradle
  const buildGradlePath = path.join(process.cwd(), BUILD_GRADLE_FILE);
  if (!fs.existsSync(buildGradlePath)) {
    console.log(`File not found: ${BUILD_GRADLE_FILE}`);
    return;
  }

  const buildGradleContent = fs.readFileSync(buildGradlePath, 'utf8');
  const sentryAndroidVersionMatch = buildGradleContent.match(/api\s+['"]io\.sentry:sentry-android:([^'"]+)['"]/);

  if (!sentryAndroidVersionMatch) {
    warn(
      createSectionWarning(
        'Android SDK Version Check',
        'Could not parse `sentry-android` version from build.gradle',
        '⚠️',
      ),
    );
    return;
  }

  const sdkVersion = sentryAndroidVersionMatch[1];
  console.log(`sentry-android version in build.gradle: ${sdkVersion}`);

  // Fetch the version bundled by the gradle plugin
  let bundledVersion;
  try {
    bundledVersion = await fetchBundledSentryAndroidVersion(gradlePluginVersion);
    console.log(`sentry-android version bundled by gradle plugin ${gradlePluginVersion}: ${bundledVersion}`);
  } catch (e) {
    warn(
      createSectionWarning(
        'Android SDK Version Check',
        `⚠️ Could not determine sentry-android version bundled by gradle plugin ${gradlePluginVersion}:\n\n${e.message}`,
        '⚠️',
      ),
    );
    return;
  }

  // Compare versions
  if (sdkVersion !== bundledVersion) {
    fail(
      createSectionWarning(
        'Android SDK Version Mismatch',
        `| Component | Version |\n` +
          `|-----------|--------|\n` +
          `| \`sentry-android\` in build.gradle | **${sdkVersion}** |\n` +
          `| \`sentry-android\` bundled by gradle plugin ${gradlePluginVersion} | **${bundledVersion}** |\n\n` +
          `This mismatch will cause crashes on Android with error:\n` +
          `> \`IllegalStateException: Sentry SDK has detected a mix of versions\`\n\n` +
          `**Fix:** Update \`packages/core/android/build.gradle\` to use version \`${bundledVersion}\` ` +
          `or wait for a gradle plugin release that bundles \`${sdkVersion}\`.`,
      ),
    );
  } else {
    console.log('✅ sentry-android versions match');
  }
};
