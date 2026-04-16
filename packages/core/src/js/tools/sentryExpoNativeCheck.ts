import * as fs from 'fs';
import * as path from 'path';

const PREFIX = '[@sentry/react-native/expo]';

/**
 * Checks if prebuilt native projects (ios/android) have been configured with Sentry.
 * If native directories exist but are missing Sentry configuration, warns the user
 * to run `npx expo prebuild --clean`.
 *
 * This only runs for Expo projects (detected by the presence of `expo` in package.json dependencies).
 */
export function checkSentryExpoNativeProject(projectRoot: string): void {
  try {
    if (!isExpoProject(projectRoot)) {
      return;
    }

    const missingPlatforms: string[] = [];

    if (isIOSProjectMissingSentry(projectRoot)) {
      missingPlatforms.push('iOS');
    }

    if (isAndroidProjectMissingSentry(projectRoot)) {
      missingPlatforms.push('Android');
    }

    if (missingPlatforms.length > 0) {
      const platforms = missingPlatforms.join(' and ');
      // oxlint-disable-next-line eslint(no-console)
      console.warn(
        `${PREFIX} Sentry native configuration is missing from your prebuilt ${platforms} project.
Run \`npx expo prebuild --clean\` to apply the Sentry Expo Plugin changes.
Without this, source maps upload and native crash reporting may not work correctly.`,
      );
    }
  } catch (_) {
    // Never crash Metro startup — silently ignore any errors
  }
}

function isExpoProject(projectRoot: string): boolean {
  const packageJsonPath = path.resolve(projectRoot, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return false;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return !!(packageJson.dependencies?.expo || packageJson.devDependencies?.expo);
}

function isIOSProjectMissingSentry(projectRoot: string): boolean {
  const iosDir = path.resolve(projectRoot, 'ios');
  if (!fs.existsSync(iosDir)) {
    return false;
  }

  const pbxprojPath = findPbxprojFile(iosDir);
  if (!pbxprojPath) {
    return false;
  }

  const pbxprojContents = fs.readFileSync(pbxprojPath, 'utf8');
  return !pbxprojContents.includes('sentry-xcode') && !pbxprojContents.includes('Upload Debug Symbols to Sentry');
}

function isAndroidProjectMissingSentry(projectRoot: string): boolean {
  const buildGradlePath = path.resolve(projectRoot, 'android', 'app', 'build.gradle');
  if (!fs.existsSync(buildGradlePath)) {
    return false;
  }

  const buildGradleContents = fs.readFileSync(buildGradlePath, 'utf8');
  return !buildGradleContents.includes('sentry.gradle') && !buildGradleContents.includes('io.sentry.android.gradle');
}

function findPbxprojFile(iosDir: string): string | null {
  const entries = fs.readdirSync(iosDir);
  for (const entry of entries) {
    if (entry.endsWith('.xcodeproj')) {
      const pbxprojPath = path.resolve(iosDir, entry, 'project.pbxproj');
      if (fs.existsSync(pbxprojPath)) {
        return pbxprojPath;
      }
    }
  }
  return null;
}
