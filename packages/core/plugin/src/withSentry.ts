import type { ExpoConfig } from '@expo/config-types';
import type { ConfigPlugin } from 'expo/config-plugins';

import { createRunOncePlugin, withDangerousMod } from 'expo/config-plugins';

import type { SentryAndroidGradlePluginOptions } from './withSentryAndroidGradlePlugin';

import { bold, warnOnce } from './logger';
import { writeSentryOptions } from './utils';
import { PLUGIN_NAME, PLUGIN_VERSION } from './version';
import { withSentryAndroid } from './withSentryAndroid';
import { withSentryAndroidGradlePlugin } from './withSentryAndroidGradlePlugin';
import { withSentryIOS } from './withSentryIOS';

interface PluginProps {
  organization?: string;
  project?: string;
  authToken?: string;
  url?: string;
  useNativeInit?: boolean;
  options?: Record<string, unknown>;
  experimental_android?: SentryAndroidGradlePluginOptions;
}

/**
 * Store build-time properties in config._internal so they're discoverable
 * by the sourcemap upload script via `expo config --json`, even when
 * withSentry is used programmatically in app.config.ts.
 *
 * We use _internal instead of extra because _internal is stripped from the
 * public config (app manifest) and not shipped in the production app, while
 * extra would leak org/project metadata into the app binary.
 */
function storeBuildPropertiesInConfig(config: ExpoConfig, props: PluginProps | void): void {
  if (props?.organization || props?.project) {
    // ExpoConfig types don't include _internal, but it's a standard Expo field
    // used by config plugins infrastructure (e.g. pluginHistory).
    const configWithInternal = config as ExpoConfig & { _internal?: Record<string, unknown> };
    configWithInternal._internal = configWithInternal._internal || {};
    configWithInternal._internal.sentryBuildProperties = {
      organization: props?.organization,
      project: props?.project,
      url: props?.url || 'https://sentry.io/',
    };
  }
}

const withSentryPlugin: ConfigPlugin<PluginProps | void> = (config, props) => {
  const sentryProperties = getSentryProperties(props);

  if (props?.authToken) {
    // If not removed, the plugin config with the authToken will be written to the application package
    delete props.authToken;
  }

  storeBuildPropertiesInConfig(config, props);

  let cfg = config;
  const pluginOptions = props?.options ? { ...props.options } : {};
  // oxlint-disable-next-line typescript-eslint(no-unsafe-member-access)
  const environment = process.env.SENTRY_ENVIRONMENT;
  if (environment) {
    pluginOptions.environment = environment;
  }
  if (Object.keys(pluginOptions).length > 0) {
    cfg = withSentryOptionsFile(cfg, pluginOptions);
  }
  if (sentryProperties !== null) {
    try {
      cfg = withSentryAndroid(cfg, { sentryProperties, useNativeInit: props?.useNativeInit });
    } catch (e) {
      warnOnce(`There was a problem with configuring your native Android project: ${e}`);
    }
    // if `enableAndroidGradlePlugin` is provided configure the Sentry Android Gradle Plugin
    if (props?.experimental_android?.enableAndroidGradlePlugin) {
      try {
        cfg = withSentryAndroidGradlePlugin(cfg, props.experimental_android);
      } catch (e) {
        warnOnce(`There was a problem with configuring Sentry Android Gradle Plugin: ${e}`);
      }
    }
    try {
      cfg = withSentryIOS(cfg, { sentryProperties, useNativeInit: props?.useNativeInit });
    } catch (e) {
      warnOnce(`There was a problem with configuring your native iOS project: ${e}`);
    }
  }

  return cfg;
};

const missingProjectMessage = '# no project found, falling back to SENTRY_PROJECT environment variable';
const missingOrgMessage = '# no org found, falling back to SENTRY_ORG environment variable';
const existingAuthTokenMessage =
  '# DO NOT COMMIT the auth token, use SENTRY_AUTH_TOKEN instead, see https://docs.sentry.io/platforms/react-native/manual-setup/';
const missingAuthTokenMessage = '# Using SENTRY_AUTH_TOKEN environment variable';

export function getSentryProperties(props: PluginProps | void): string | null {
  const { organization, project, authToken, url = 'https://sentry.io/' } = props ?? {};
  const missingProperties = ['organization', 'project'].filter(each => !props?.hasOwnProperty(each));

  if (missingProperties.length) {
    const missingPropertiesString = bold(missingProperties.join(', '));
    const warningMessage = `Missing config for ${missingPropertiesString}. Environment variables will be used as a fallback during the build. https://docs.sentry.io/platforms/react-native/manual-setup/`;
    warnOnce(warningMessage);
  }

  if (authToken) {
    warnOnce(
      `Detected unsecure use of 'authToken' in Sentry plugin configuration. To avoid exposing the token use ${bold(
        'SENTRY_AUTH_TOKEN',
      )} environment variable instead. https://docs.sentry.io/platforms/react-native/manual-setup/`,
    );
  }

  return `defaults.url=${url}
${organization ? `defaults.org=${organization}` : missingOrgMessage}
${project ? `defaults.project=${project}` : missingProjectMessage}
${authToken ? `${existingAuthTokenMessage}\nauth.token=${authToken}` : missingAuthTokenMessage}`;
}

function withSentryOptionsFile(config: ExpoConfig, pluginOptions: Record<string, unknown>): ExpoConfig {
  // withDangerousMod requires a platform key, but sentry.options.json is at the project root.
  // We apply to both platforms so it works with `expo prebuild --platform ios` or `--platform android`.
  let cfg = withDangerousMod(config, [
    'android',
    mod => {
      writeSentryOptions(mod.modRequest.projectRoot, pluginOptions);
      return mod;
    },
  ]);
  cfg = withDangerousMod(cfg, [
    'ios',
    mod => {
      writeSentryOptions(mod.modRequest.projectRoot, pluginOptions);
      return mod;
    },
  ]);
  return cfg;
}

const withSentry = createRunOncePlugin(withSentryPlugin, PLUGIN_NAME, PLUGIN_VERSION);

export { withSentry };
