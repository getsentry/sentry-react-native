import { warnOnce } from '../../plugin/src/utils';
import { modifyAppBuildGradle } from '../../plugin/src/withSentryAndroid';

jest.mock('../../plugin/src/utils');

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
});
