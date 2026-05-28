import { warnOnce } from '../../plugin/src/logger';
import { modifyAppBuildGradle } from '../../plugin/src/withSentryAndroid';

jest.mock('../../plugin/src/logger');

const buildGradleWithSentry = `
apply from: new File(["node", "--print", "require('path').dirname(require.resolve('@sentry/react-native/package.json'))"].execute().text.trim(), "sentry.gradle.kts")

android {
}
`;

const buildGradleWithOutSentry = `
android {
}
`;

const monoRepoBuildGradleWithSentry = `
apply from: new File(["node", "--print", "require('path').dirname(require.resolve('@sentry/react-native/package.json'))"].execute().text.trim(), "sentry.gradle.kts")

android {
}
`;

const monoRepoBuildGradleWithOutSentry = `
android {
}
`;

const buildGradleWithOldSentryGradle = `
apply from: new File(["node", "--print", "require('path').dirname(require.resolve('@sentry/react-native/package.json'))"].execute().text.trim(), "sentry.gradle")

android {
}
`;

const buildGradleWithAndroidGradlePlugin = `
apply plugin: "io.sentry.android.gradle"

android {
}
`;

const buildGradleWithOutReactGradleScript = `
`;

describe('Configures Android native project correctly', () => {
  it("Non monorepo: Doesn't modify app/build.gradle if Sentry's already configured", () => {
    expect(modifyAppBuildGradle(buildGradleWithSentry)).toStrictEqual(buildGradleWithSentry);
  });

  it('Non monorepo: Adds sentry.gradle script if not present already', () => {
    expect(modifyAppBuildGradle(buildGradleWithOutSentry)).toStrictEqual(buildGradleWithSentry);
  });

  it("Monorepo: Doesn't modify app/build.gradle if Sentry's already configured", () => {
    expect(modifyAppBuildGradle(monoRepoBuildGradleWithSentry)).toStrictEqual(monoRepoBuildGradleWithSentry);
  });

  it('Monorepo: Adds sentry.gradle script if not present already', () => {
    expect(modifyAppBuildGradle(monoRepoBuildGradleWithOutSentry)).toStrictEqual(monoRepoBuildGradleWithSentry);
  });

  it('Migrates old sentry.gradle reference to sentry.gradle.kts', () => {
    expect(modifyAppBuildGradle(buildGradleWithOldSentryGradle)).toStrictEqual(buildGradleWithSentry);
  });

  it('Migrates old sentry.gradle and applies disableAutoUpload in one pass', () => {
    const result = modifyAppBuildGradle(buildGradleWithOldSentryGradle, true);
    expect(result).toContain('sentry.gradle.kts');
    expect(result).not.toContain('"sentry.gradle"');
    expect(result).toContain('project.ext.shouldSentryAutoUploadGeneral = { -> return false }');
  });

  it('Does not rewrite io.sentry.android.gradle plugin declaration', () => {
    const result = modifyAppBuildGradle(buildGradleWithAndroidGradlePlugin);
    expect(result).toContain('io.sentry.android.gradle"');
    expect(result).not.toContain('io.sentry.android.gradle.kts');
    expect(result).toContain('sentry.gradle.kts');
  });

  it('Warns to file a bug report if no react.gradle is found', () => {
    modifyAppBuildGradle(buildGradleWithOutReactGradleScript);
    expect(warnOnce).toHaveBeenCalled();
  });

  it('Adds shouldSentryAutoUploadGeneral override when disableAutoUpload is true', () => {
    const result = modifyAppBuildGradle(buildGradleWithOutSentry, true);
    expect(result).toContain('project.ext.shouldSentryAutoUploadGeneral = { -> return false }');
    expect(result).toContain('sentry.gradle');
  });

  it('Does not add shouldSentryAutoUploadGeneral override when disableAutoUpload is false', () => {
    const result = modifyAppBuildGradle(buildGradleWithOutSentry, false);
    expect(result).not.toContain('shouldSentryAutoUploadGeneral');
  });

  it('Adds override to already-configured build.gradle on re-prebuild', () => {
    const result = modifyAppBuildGradle(buildGradleWithSentry, true);
    expect(result).toContain('project.ext.shouldSentryAutoUploadGeneral = { -> return false }');
  });

  it('Does not duplicate override if already present', () => {
    const gradleWithOverride = `
apply from: new File(["node", "--print", "require('path').dirname(require.resolve('@sentry/react-native/package.json'))"].execute().text.trim(), "sentry.gradle.kts")
project.ext.shouldSentryAutoUploadGeneral = { -> return false }

android {
}
`;
    const result = modifyAppBuildGradle(gradleWithOverride, true);
    expect(result).toBe(gradleWithOverride);
  });

  it('Removes override when toggling disableAutoUpload back to false', () => {
    const gradleWithOverride = `
apply from: new File(["node", "--print", "require('path').dirname(require.resolve('@sentry/react-native/package.json'))"].execute().text.trim(), "sentry.gradle.kts")
project.ext.shouldSentryAutoUploadGeneral = { -> return false }

android {
}
`;
    const result = modifyAppBuildGradle(gradleWithOverride, false);
    expect(result).not.toContain('shouldSentryAutoUploadGeneral');
    expect(result).toContain('sentry.gradle');
    expect(result).toContain('android {');
  });

  it('No-ops when toggling to false and override is not present', () => {
    const result = modifyAppBuildGradle(buildGradleWithSentry, false);
    expect(result).toBe(buildGradleWithSentry);
  });
});
