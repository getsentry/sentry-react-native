export function setIosDsn(dsn: string) {
  const fs = require('fs');
  const path = require('path');

  const sentryOptionsPath = path.join(__dirname, '../../sentry.options.json');
  const sentryOptions = JSON.parse(fs.readFileSync(sentryOptionsPath, 'utf8'));
  sentryOptions.dsn = dsn;
  fs.writeFileSync(sentryOptionsPath, JSON.stringify(sentryOptions, null, 2));
}

export function setAndroidDsn(dsn: string) {
  // TODO: Set the DSN for the Android app
}
