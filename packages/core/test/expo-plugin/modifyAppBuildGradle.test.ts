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
});
