import { warnOnce } from '../../plugin/src/logger';
import { modifyAppBuildGradle } from '../../plugin/src/withSentryAndroid';

jest.mock('../../plugin/src/logger');

const buildGradleWithSentry = `
apply from: new File(["node", "--print", "require('path').dirname(require.resolve('@sentry/react-native/package.json'))"].execute().text.trim(), "sentry.gradle")

android {
}
`;

const buildGradleWithOutSentry = `
android {
}
`;

const monoRepoBuildGradleWithSentry = `
apply from: new File(["node", "--print", "require('path').dirname(require.resolve('@sentry/react-native/package.json'))"].execute().text.trim(), "sentry.gradle")

android {
}
`;

const monoRepoBuildGradleWithOutSentry = `
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
apply from: new File(["node", "--print", "require('path').dirname(require.resolve('@sentry/react-native/package.json'))"].execute().text.trim(), "sentry.gradle")
project.ext.shouldSentryAutoUploadGeneral = { -> return false }

android {
}
`;
    const result = modifyAppBuildGradle(gradleWithOverride, true);
    expect(result).toBe(gradleWithOverride);
  });
});
