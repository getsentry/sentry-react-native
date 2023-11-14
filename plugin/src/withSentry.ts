import { ConfigPlugin, createRunOncePlugin, WarningAggregator } from 'expo/config-plugins';

import { withSentryAndroid } from './withSentryAndroid';
import { withSentryIOS } from './withSentryIOS';

const pkg = require('../../package.json');

interface PluginProps {
  organization?: string;
  project?: string;
  authToken?: string;
  url?: string;
}

const withSentry: ConfigPlugin<PluginProps | void> = (config, props) => {
  const sentryProperties = getSentryProperties(props);
  if (sentryProperties !== null) {
    try {
      config = withSentryAndroid(config, sentryProperties);
    } catch (e) {
      WarningAggregator.addWarningAndroid(
        'sentry-expo',
        'There was a problem configuring sentry-expo in your native Android project: ' + e,
      );
    }
    try {
      config = withSentryIOS(config, sentryProperties);
    } catch (e) {
      WarningAggregator.addWarningIOS(
        'sentry-expo',
        'There was a problem configuring sentry-expo in your native iOS project: ' + e,
      );
    }
  }
  return config;
};

const missingAuthTokenMessage = `# auth.token is configured through SENTRY_AUTH_TOKEN environment variable`;
const missingProjectMessage = `# no project found, falling back to SENTRY_PROJECT environment variable`;
const missingOrgMessage = `# no org found, falling back to SENTRY_ORG environment variable`;

export function getSentryProperties(props: PluginProps | void): string | null {
  const { organization, project, authToken, url = 'https://sentry.io/' } = props ?? {};
  const missingProperties = ['organization', 'project'].filter(each => !props?.hasOwnProperty(each));

  if (missingProperties.length) {
    const warningMessage = `Missing Sentry configuration properties: ${missingProperties.join(
      ', ',
    )} in config plugin. Builds will fall back to environment variables. Refer to @sentry/react-native docs for how to configure this.`;
    WarningAggregator.addWarningAndroid('sentry-expo', warningMessage);
    WarningAggregator.addWarningIOS('sentry-expo', warningMessage);
  }

  return `defaults.url=${url}
${organization ? `defaults.org=${organization}` : missingOrgMessage}
${project ? `defaults.project=${project}` : missingProjectMessage}
${
  authToken
    ? `# Configure this value through \`SENTRY_AUTH_TOKEN\` environment variable instead. See:https://docs.expo.dev/guides/using-sentry/#app-configuration\nauth.token=${authToken}`
    : missingAuthTokenMessage
}
`;
}

export default createRunOncePlugin(withSentry, pkg.name, pkg.version);
