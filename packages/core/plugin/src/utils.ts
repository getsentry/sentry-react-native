// tsgolint incorrectly types `fs` as `error` — false positive with DANGEROUSLY_SUPPRESS_PROGRAM_DIAGNOSTICS
/* oxlint-disable typescript-eslint(no-unsafe-member-access) */
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

export function writeSentryOptions(projectRoot: string, pluginOptions: Record<string, unknown>): void {
  const optionsFilePath = path.resolve(projectRoot, SENTRY_OPTIONS_FILE_NAME);

  let existingOptions: Record<string, unknown> = {};
  if (fs.existsSync(optionsFilePath)) {
    try {
      existingOptions = JSON.parse(fs.readFileSync(optionsFilePath, 'utf8'));
    } catch (e) {
      warnOnce(`Failed to parse ${SENTRY_OPTIONS_FILE_NAME}: ${e}. These options will not be set.`);
      return;
    }
  }

  const mergedOptions = { ...existingOptions, ...pluginOptions };
  fs.writeFileSync(optionsFilePath, `${JSON.stringify(mergedOptions, null, 2)}\n`);
}
