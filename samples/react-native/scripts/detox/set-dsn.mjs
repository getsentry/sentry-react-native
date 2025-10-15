import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';
import * as path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function setIosDsn() {
  setDsn('http://key@localhost:8961/123456');
}

export function setAndroidDsn() {
  setDsn('http://key@10.0.2.2:8961/123456');
}

function setDsn(dsn) {
  const sentryOptionsPath = path.join(__dirname, '../../sentry.options.json');
  const sentryOptions = JSON.parse(fs.readFileSync(sentryOptionsPath, 'utf8'));
  sentryOptions.dsn = dsn;
  fs.writeFileSync(
    sentryOptionsPath,
    JSON.stringify(sentryOptions, null, 2) + '\n',
  );
  console.log('Dsn set to: ', dsn);
}
