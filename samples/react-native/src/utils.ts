export function logWithoutTracing(...args: unknown[]) {
  if ('__sentry_original__' in console.log) {
    console.log.__sentry_original__(...args);
  } else {
    console.log(...args);
  }
}
