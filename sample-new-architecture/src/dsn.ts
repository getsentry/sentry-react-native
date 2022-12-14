import * as Sentry from '@sentry/react-native';

export const SENTRY_INTERNAL_DSN =
  'https://d870ad989e7046a8b9715a57f59b23b5@o447951.ingest.sentry.io/5428561';

export const getCurrentDsn = () => {
  return Sentry.getCurrentHub().getClient()?.getOptions().dsn;
};
