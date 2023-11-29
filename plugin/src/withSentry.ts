import type { ConfigPlugin } from 'expo/config-plugins';
import { createRunOncePlugin, WarningAggregator } from 'expo/config-plugins';

import { SDK_PACKAGE_NAME, sdkPackage } from './utils';
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
  let cfg = config;
  if (sentryProperties !== null) {
    try {
      cfg = withSentryAndroid(cfg, sentryProperties);
    } catch (e) {
      WarningAggregator.addWarningAndroid(
        SDK_PACKAGE_NAME,
        `There was a problem configuring sentry-expo in your native Android project: ${e}`,
      );
    }
    try {
      cfg = withSentryIOS(cfg, sentryProperties);
    } catch (e) {
      WarningAggregator.addWarningIOS(
        SDK_PACKAGE_NAME,
        `There was a problem configuring sentry-expo in your native iOS project: ${e}`,
      );
    }
  }
  return cfg;
};

const missingAuthTokenMessage = '# auth.token is configured through SENTRY_AUTH_TOKEN environment variable';
const missingProjectMessage = '# no project found, falling back to SENTRY_PROJECT environment variable';
const missingOrgMessage = '# no org found, falling back to SENTRY_ORG environment variable';

export function getSentryProperties(props: PluginProps | void): string | null {
  const { organization, project, authToken, url = 'https://sentry.io/' } = props ?? {};
  // eslint-disable-next-line no-prototype-builtins
  const missingProperties = ['organization', 'project'].filter(each => !props?.hasOwnProperty(each));

  if (missingProperties.length) {
    const warningMessage = `Missing Sentry configuration properties: ${missingProperties.join(
      ', ',
    )} in config plugin. Builds will fall back to environment variables. See: https://docs.sentry.io/platforms/react-native/manual-setup/.`;
    WarningAggregator.addWarningAndroid(SDK_PACKAGE_NAME, warningMessage);
    WarningAggregator.addWarningIOS(SDK_PACKAGE_NAME, warningMessage);
  }

  return `defaults.url=${url}
${organization ? `defaults.org=${organization}` : missingOrgMessage}
${project ? `defaults.project=${project}` : missingProjectMessage}
${
  authToken
    ? `# Configure this value through \`SENTRY_AUTH_TOKEN\` environment variable instead. See: https://docs.sentry.io/platforms/react-native/manual-setup/\nauth.token=${authToken}`
    : missingAuthTokenMessage
}
`;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
const withSentry = createRunOncePlugin(withSentryPlugin, sdkPackage.name, sdkPackage.version);

export { withSentry };
