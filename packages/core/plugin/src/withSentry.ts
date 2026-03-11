import type { ExpoConfig } from '@expo/config-types';
import type { ConfigPlugin } from 'expo/config-plugins';
import { createRunOncePlugin, withDangerousMod } from 'expo/config-plugins';
import { bold, warnOnce } from './logger';
import { writeSentryOptionsEnvironment } from './utils';
import { PLUGIN_NAME, PLUGIN_VERSION } from './version';
import { withSentryAndroid } from './withSentryAndroid';
import type { SentryAndroidGradlePluginOptions } from './withSentryAndroidGradlePlugin';
import { withSentryAndroidGradlePlugin } from './withSentryAndroidGradlePlugin';
import { withSentryIOS } from './withSentryIOS';

interface PluginProps {
  organization?: string;
  project?: string;
  authToken?: string;
  url?: string;
  useNativeInit?: boolean;
  environment?: string;
  experimental_android?: SentryAndroidGradlePluginOptions;
}

const withSentryPlugin: ConfigPlugin<PluginProps | void> = (config, props) => {
  const sentryProperties = getSentryProperties(props);

  if (props?.authToken) {
    // If not removed, the plugin config with the authToken will be written to the application package
    delete props.authToken;
  }

  let cfg = config;
  const environment = props?.environment ?? process.env.SENTRY_ENVIRONMENT;
  if (environment) {
    cfg = withSentryOptionsEnvironment(cfg, environment);
  }
  if (sentryProperties !== null) {
    try {
      cfg = withSentryAndroid(cfg, { sentryProperties, useNativeInit: props?.useNativeInit });
    } catch (e) {
      warnOnce(`There was a problem with configuring your native Android project: ${e}`);
    }
    // if `enableAndroidGradlePlugin` is provided configure the Sentry Android Gradle Plugin
    if (props?.experimental_android && props?.experimental_android?.enableAndroidGradlePlugin) {
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
  // eslint-disable-next-line no-prototype-builtins
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

function withSentryOptionsEnvironment(config: ExpoConfig, environment: string): ExpoConfig {
  // withDangerousMod requires a platform key, but sentry.options.json is at the project root.
  // We apply to both platforms so it works with `expo prebuild --platform ios` or `--platform android`.
  let cfg = withDangerousMod(config, [
    'android',
    mod => {
      writeSentryOptionsEnvironment(mod.modRequest.projectRoot, environment);
      return mod;
    },
  ]);
  cfg = withDangerousMod(cfg, [
    'ios',
    mod => {
      writeSentryOptionsEnvironment(mod.modRequest.projectRoot, environment);
      return mod;
    },
  ]);
  return cfg;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
const withSentry = createRunOncePlugin(withSentryPlugin, PLUGIN_NAME, PLUGIN_VERSION);

export { withSentry };
