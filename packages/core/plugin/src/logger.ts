const warningMap = new Map<string, boolean>();

/**
 * Log a warning message only once per run.
 * This is used to avoid spamming the console with the same message.
 */
export function warnOnce(message: string): void {
  if (!warningMap.has(message)) {
    warningMap.set(message, true);
    // eslint-disable-next-line no-console
    console.warn(yellow(prefix(message)));
  }
}

/**
 * Prefix message with `› [value]`.
 *
 * Example:
 * ```
 * › [@sentry/react-native/expo] This is a warning message
 * ```
 */
export function prefix(value: string): string {
  return `› ${bold('[@sentry/react-native/expo]')} ${value}`;
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
