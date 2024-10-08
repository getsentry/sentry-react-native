import { fill } from '@sentry/utils';

/**
 * The same as `import { fill } from '@sentry/utils';` but with explicit types.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fillTyped<Source extends { [key: string]: any }, Name extends keyof Source & string>(
  source: Source,
  name: Name,
  replacement: (original: Source[Name]) => Source[Name],
): void {
  fill(source, name, replacement);
}
