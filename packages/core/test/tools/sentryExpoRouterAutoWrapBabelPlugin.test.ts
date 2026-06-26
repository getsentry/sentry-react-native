import { transformSync } from '@babel/core';

import sentryExpoRouterAutoWrapBabelPlugin from '../../src/js/tools/sentryExpoRouterAutoWrapBabelPlugin';

function transform(code: string, filename: string = '/app/(tabs)/index.tsx'): string {
  const result = transformSync(code, {
    filename,
    babelrc: false,
    configFile: false,
    plugins: [sentryExpoRouterAutoWrapBabelPlugin],
  });
  return result?.code ?? '';
}

describe('sentryExpoRouterAutoWrapBabelPlugin', () => {
  it('wraps a plain `export { ErrorBoundary } from "expo-router"` re-export', () => {
    const out = transform(`export { ErrorBoundary } from 'expo-router';`);
    expect(out).toMatch(
      /import\s*\{\s*ErrorBoundary as __sentryOriginalExpoErrorBoundary\s*\}\s*from\s*['"]expo-router['"]/,
    );
    expect(out).toMatch(
      /import\s*\{\s*wrapExpoRouterErrorBoundary as __sentryWrapExpoRouterErrorBoundary\s*\}\s*from\s*['"]@sentry\/react-native['"]/,
    );
    expect(out).toContain(
      `export const ErrorBoundary = __sentryWrapExpoRouterErrorBoundary(__sentryOriginalExpoErrorBoundary)`,
    );
  });

  it('preserves the user-chosen name on aliased re-exports', () => {
    const out = transform(`export { ErrorBoundary as RouteErrorBoundary } from 'expo-router';`);
    expect(out).toContain(
      `export const RouteErrorBoundary = __sentryWrapExpoRouterErrorBoundary(__sentryOriginalExpoErrorBoundary)`,
    );
  });

  it('keeps sibling specifiers untouched on mixed re-exports', () => {
    const out = transform(`export { ErrorBoundary, Stack } from 'expo-router';`);
    expect(out).toContain(
      `export const ErrorBoundary = __sentryWrapExpoRouterErrorBoundary(__sentryOriginalExpoErrorBoundary)`,
    );
    expect(out).toMatch(/export\s*\{\s*Stack\s*\}\s*from\s*['"]expo-router['"]/);
  });

  it('leaves unrelated re-exports alone', () => {
    const src = `export { Stack } from 'expo-router';\nexport { foo } from 'other-pkg';`;
    const out = transform(src);
    expect(out).not.toContain('__sentryWrapExpoRouterErrorBoundary');
    expect(out).not.toContain('@sentry/react-native');
  });

  it('wraps every ErrorBoundary re-export when several appear in the same file', () => {
    const src = `export { ErrorBoundary } from 'expo-router';\nexport { ErrorBoundary as Other } from 'expo-router';`;
    const out = transform(src);
    const wrapCalls = out.match(/__sentryWrapExpoRouterErrorBoundary\(/g)?.length ?? 0;
    expect(wrapCalls).toBe(2);
    expect(out).toMatch(/export const ErrorBoundary = __sentryWrapExpoRouterErrorBoundary/);
    expect(out).toMatch(/export const Other = __sentryWrapExpoRouterErrorBoundary/);
    // Helper imports must be emitted exactly once per file — duplicates are
    // an ES module syntax error.
    const expoImports =
      out.match(/import\s*\{\s*ErrorBoundary as __sentryOriginalExpoErrorBoundary\s*\}/g)?.length ?? 0;
    const sentryImports =
      out.match(/import\s*\{\s*wrapExpoRouterErrorBoundary as __sentryWrapExpoRouterErrorBoundary\s*\}/g)?.length ?? 0;
    expect(expoImports).toBe(1);
    expect(sentryImports).toBe(1);
  });

  it('is idempotent — running the plugin twice does not double-wrap', () => {
    const first = transform(`export { ErrorBoundary } from 'expo-router';`);
    const second = transform(first);
    const occurrences = second.match(/__sentryWrapExpoRouterErrorBoundary\(/g)?.length ?? 0;
    expect(occurrences).toBe(1);
  });

  it('skips files inside node_modules', () => {
    const out = transform(`export { ErrorBoundary } from 'expo-router';`, '/proj/node_modules/expo-router/build/x.js');
    expect(out).not.toContain('@sentry/react-native');
    expect(out).toMatch(/export\s*\{\s*ErrorBoundary\s*\}\s*from\s*['"]expo-router['"]/);
  });
});
