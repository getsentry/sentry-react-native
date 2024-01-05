import * as Sentry from '@sentry/react-native';

export const SENTRY_INTERNAL_DSN =
  'https://1df17bd4e543fdb31351dee1768bb679@o447951.ingest.sentry.io/5428561';

export const getCurrentDsn = () => {
  return Sentry.getCurrentHub().getClient()?.getOptions().dsn;
};
