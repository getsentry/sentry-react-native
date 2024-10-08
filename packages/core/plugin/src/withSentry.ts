import type { ConfigPlugin } from 'expo/config-plugins';
import { createRunOncePlugin } from 'expo/config-plugins';

import { bold, sdkPackage, warnOnce } from './utils';
import { withSentryAndroid } from './withSentryAndroid';
import { withSentryIOS } from './withSentryIOS';

interface PluginProps {
  organization?: string;
  project?: string;
  authToken?: string;
  url?: string;
}

const withSentryPlugin: ConfigPlugin<PluginProps | void> = (config, props) => {
  const sentryProperties = getSentryProperties(props);

  if (props && props.authToken) {
    // If not removed, the plugin config with the authToken will be written to the application package
    delete props.authToken;
  }

  let cfg = config;
  if (sentryProperties !== null) {
    try {
      cfg = withSentryAndroid(cfg, sentryProperties);
    } catch (e) {
      warnOnce(`There was a problem with configuring your native Android project: ${e}`);
    }
    try {
      cfg = withSentryIOS(cfg, sentryProperties);
    } catch (e) {
      warnOnce(`There was a problem with configuring your native iOS project: ${e}`);
    }
  }

  return cfg;
};

const missingProjectMessage = '# no project found, falling back to SENTRY_PROJECT environment variable';
const missingOrgMessage = '# no org found, falling back to SENTRY_ORG environment variable';
const existingAuthTokenMessage = `# DO NOT COMMIT the auth token, use SENTRY_AUTH_TOKEN instead, see https://docs.sentry.io/platforms/react-native/manual-setup/`;
const missingAuthTokenMessage = `# Using SENTRY_AUTH_TOKEN environment variable`;

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

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
const withSentry = createRunOncePlugin(withSentryPlugin, sdkPackage.name, sdkPackage.version);

export { withSentry };
