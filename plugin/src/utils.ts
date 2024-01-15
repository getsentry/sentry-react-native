import * as fs from 'fs';
import * as path from 'path';

export function writeSentryPropertiesTo(filepath: string, sentryProperties: string): void {
  if (!fs.existsSync(filepath)) {
    throw new Error(`Directory '${filepath}' does not exist.`);
  }

  fs.writeFileSync(path.resolve(filepath, 'sentry.properties'), sentryProperties);
}

const sdkPackage: {
  name: string;
  version: string;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
} = require('../../package.json');

const SDK_PACKAGE_NAME = sdkPackage.name;

export { sdkPackage, SDK_PACKAGE_NAME };
