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

const SDK_PACKAGE_NAME = `${sdkPackage.name}/expo`;

const warningMap = new Map<string, boolean>();
export function warnOnce(message: string): void {
  if (!warningMap.has(message)) {
    warningMap.set(message, true);
    // eslint-disable-next-line no-console
    console.warn(yellow(`${logPrefix()} ${message}`));
  }
}

export function logPrefix(): string {
  return `› ${bold('[@sentry/react-native/expo]')}`;
}

/**
 * The same as `chalk.yellow`
 * This code is part of the SDK, we don't want to introduce a dependency on `chalk` just for this.
 */
export function yellow(message: string): string {
  return `\x1b[33m${message}\x1b[0m`;
}

/**
 * The same as `chalk.bold`
 * This code is part of the SDK, we don't want to introduce a dependency on `chalk` just for this.
 */
export function bold(message: string): string {
  return `\x1b[1m${message}\x1b[22m`;
}

export { sdkPackage, SDK_PACKAGE_NAME };
