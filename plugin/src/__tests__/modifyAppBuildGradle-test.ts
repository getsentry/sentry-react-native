import { WarningAggregator } from '@expo/config-plugins';

import { modifyAppBuildGradle } from '../withSentryAndroid';

jest.mock('@expo/config-plugins', () => {
  const plugins = jest.requireActual('@expo/config-plugins');
  return {
    ...plugins,
    WarningAggregator: { addWarningAndroid: jest.fn() },
  };
});

const buildGradleWithSentry = `
apply from: new File(["node", "--print", "require.resolve('@sentry/react-native/package.json')"].execute().text.trim(), "../sentry.gradle")

android {
}
`;

const buildGradleWithOutSentry = `
android {
}
`;

const monoRepoBuildGradleWithSentry = `
apply from: new File(["node", "--print", "require.resolve('@sentry/react-native/package.json')"].execute().text.trim(), "../sentry.gradle")

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
  it(`Non monorepo: Doesn't modify app/build.gradle if Sentry's already configured`, () => {
    expect(modifyAppBuildGradle(buildGradleWithSentry)).toMatch(buildGradleWithSentry);
  });

  it(`Non monorepo: Adds sentry.gradle script if not present already`, () => {
    expect(modifyAppBuildGradle(buildGradleWithOutSentry)).toMatch(buildGradleWithSentry);
  });

  it(`Monorepo: Doesn't modify app/build.gradle if Sentry's already configured`, () => {
    expect(modifyAppBuildGradle(monoRepoBuildGradleWithSentry)).toMatch(
      monoRepoBuildGradleWithSentry
    );
  });

  it(`Monorepo: Adds sentry.gradle script if not present already`, () => {
    expect(modifyAppBuildGradle(monoRepoBuildGradleWithOutSentry)).toMatch(
      monoRepoBuildGradleWithSentry
    );
  });

  it(`Warns to file a bug report if no react.gradle is found`, () => {
    modifyAppBuildGradle(buildGradleWithOutReactGradleScript);
    expect(WarningAggregator.addWarningAndroid).toHaveBeenCalled();
  });
});
