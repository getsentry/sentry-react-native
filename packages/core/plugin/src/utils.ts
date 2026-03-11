import * as fs from 'fs';
import * as path from 'path';
import { warnOnce } from './logger';

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
    try {
      options = JSON.parse(fs.readFileSync(optionsFilePath, 'utf8'));
    } catch (e) {
      warnOnce(`Failed to parse ${SENTRY_OPTIONS_FILE_NAME}: ${e}. The environment will not be set.`);
      return;
    }
  }

  options.environment = environment;
  fs.writeFileSync(optionsFilePath, `${JSON.stringify(options, null, 2)}\n`);
}
