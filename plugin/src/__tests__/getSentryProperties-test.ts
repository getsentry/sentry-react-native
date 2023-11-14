import { ExpoConfig } from 'expo/config';
import { WarningAggregator } from '@expo/config-plugins';

import { getSentryProperties } from '../withSentry';

jest.mock('@expo/config-plugins', () => {
  const plugins = jest.requireActual('@expo/config-plugins');
  return {
    ...plugins,
    WarningAggregator: { addWarningIOS: jest.fn(), addWarningAndroid: jest.fn() },
  };
});

type ExpoConfigHook = Pick<ExpoConfig, 'hooks'>;

const expoConfigBase: ExpoConfig = {
  slug: 'testproject',
  version: '1',
  name: 'testproject',
  platforms: ['ios', 'android'],
};

const hookWithoutConfig: ExpoConfigHook = {
  hooks: {
    postPublish: [
      {
        file: 'sentry-expo/upload-sourcemaps',
      },
    ],
  },
};

const hookWithEmptyConfig: ExpoConfigHook = {
  hooks: {
    postPublish: [
      {
        file: 'sentry-expo/upload-sourcemaps',
        config: {},
      },
    ],
  },
};

const postPublishHook: ExpoConfigHook = {
  hooks: {
    postPublish: [
      {
        file: 'sentry-expo/upload-sourcemaps',
        config: {
          organization: 'test-org',
          project: 'myProjectName',
          authToken: '123-abc',
        },
      },
    ],
  },
};

const postPublishHookCustomURL: ExpoConfigHook = {
  hooks: {
    postPublish: [
      {
        file: 'sentry-expo/upload-sourcemaps',
        config: {
          organization: 'test-org',
          project: 'myProjectName',
          authToken: '123-abc',
          url: 'specialWebsite.com',
        },
      },
    ],
  },
};

const postPublishHookWithoutProperties: ExpoConfigHook = {
  hooks: {
    postPublish: [
      {
        file: 'sentry-expo/upload-sourcemaps',
        config: {
          url: 'some-url',
        },
      },
    ],
  },
};

const postExportHook: ExpoConfigHook = {
  hooks: {
    postExport: [
      {
        file: 'sentry-expo/upload-sourcemaps',
        config: {
          organization: 'test-org',
          project: 'myProjectName',
          authToken: '123-abc',
        },
      },
    ],
  },
};

const postExportHookWithoutProperties: ExpoConfigHook = {
  hooks: {
    postPublish: [
      {
        file: 'sentry-expo/upload-sourcemaps',
        config: {
          url: 'some-url',
        },
      },
    ],
  },
};

describe('Get Sentry properties from app config', () => {
  it(`Returns null if no Sentry hook defined`, () => {
    expect(
      getSentryProperties({
        ...expoConfigBase,
      })
    ).toBeNull();
  });

  it(`defaults URL only if no URL provided`, () => {
    expect(
      getSentryProperties({
        ...expoConfigBase,
        ...postPublishHook,
      })
    ).toContain('defaults.url=https://sentry.io/');

    expect(
      getSentryProperties({
        ...expoConfigBase,
        ...postPublishHookCustomURL,
      })
    ).toContain('defaults.url=specialWebsite.com');

    expect(
      getSentryProperties({
        ...expoConfigBase,
        ...postPublishHookCustomURL,
      })
    ).not.toContain('defaults.url=https://sentry.io/');
  });

  it(`Returns properly formatted string`, () => {
    expect(
      getSentryProperties({
        ...expoConfigBase,
        ...postPublishHook,
      })
    ).toBe(
      `defaults.url=https://sentry.io/
defaults.org=test-org
defaults.project=myProjectName
# Configure this value through \`SENTRY_AUTH_TOKEN\` environment variable instead. See:https://docs.expo.dev/guides/using-sentry/#app-configuration
auth.token=123-abc
`
    );
  });

  it(`Handles postExport hooks`, () => {
    expect(
      getSentryProperties({
        ...expoConfigBase,
        ...postExportHook,
      })
    ).toBe(
      `defaults.url=https://sentry.io/
defaults.org=test-org
defaults.project=myProjectName
# Configure this value through \`SENTRY_AUTH_TOKEN\` environment variable instead. See:https://docs.expo.dev/guides/using-sentry/#app-configuration
auth.token=123-abc
`
    );
  });

  it(`Avoids writing properties if they are undefined in postPublishHook`, () => {
    expect(getSentryProperties({ ...expoConfigBase, ...postPublishHookWithoutProperties })).toBe(
      `defaults.url=some-url
# no org found, falling back to SENTRY_ORG environment variable
# no project found, falling back to SENTRY_PROJECT environment variable
# auth.token is configured through SENTRY_AUTH_TOKEN environment variable
`
    );
  });

  it(`Avoids writing properties if they are undefined in postExport`, () => {
    expect(getSentryProperties({ ...expoConfigBase, ...postExportHookWithoutProperties })).toBe(
      `defaults.url=some-url
# no org found, falling back to SENTRY_ORG environment variable
# no project found, falling back to SENTRY_PROJECT environment variable
# auth.token is configured through SENTRY_AUTH_TOKEN environment variable
`
    );
  });

  let consoleWarnMock;
  describe('Tests with warnings', () => {
    beforeEach(() => {
      consoleWarnMock = jest.spyOn(console, 'warn').mockImplementation();
    });

    afterEach(() => {
      consoleWarnMock.mockRestore();
    });

    it(`Warns (returns empty string) if no config found under hook`, () => {
      expect(
        getSentryProperties({
          ...expoConfigBase,
          ...hookWithoutConfig,
        })
      ).toBe('');

      expect(
        getSentryProperties({
          ...expoConfigBase,
          ...hookWithEmptyConfig,
        })
      ).not.toBe('');

      // todo: replace with WarningAggregator calls
      expect(WarningAggregator.addWarningIOS).toHaveBeenCalled();
      expect(WarningAggregator.addWarningAndroid).toHaveBeenCalled();
    });

    it(`Warns if not all necessary fields are found`, () => {
      const consoleWarnMock = jest.spyOn(console, 'warn').mockImplementation();
      getSentryProperties({
        ...expoConfigBase,
        ...hookWithEmptyConfig,
      });
      expect(WarningAggregator.addWarningIOS).toHaveBeenCalled();
      expect(WarningAggregator.addWarningAndroid).toHaveBeenCalled();
      consoleWarnMock.mockRestore();
    });
  });
});
