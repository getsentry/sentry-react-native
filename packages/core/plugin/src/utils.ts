import * as fs from 'fs';
import * as path from 'path';

export function writeSentryPropertiesTo(filepath: string, sentryProperties: string): void {
  if (!fs.existsSync(filepath)) {
    throw new Error(`Directory '${filepath}' does not exist.`);
  }

  fs.writeFileSync(path.resolve(filepath, 'sentry.properties'), sentryProperties);
}

const SENTRY_OPTIONS_FILE_NAME = 'sentry.options.json';

export function writeSentryOptionsEnvironment(projectRoot: string, environment: string): void {
  const optionsFilePath = path.resolve(projectRoot, SENTRY_OPTIONS_FILE_NAME);

  let options: Record<string, unknown> = {};
  if (fs.existsSync(optionsFilePath)) {
    options = JSON.parse(fs.readFileSync(optionsFilePath, 'utf8'));
  }

  options.environment = environment;
  fs.writeFileSync(optionsFilePath, `${JSON.stringify(options, null, 2)}\n`);
}
