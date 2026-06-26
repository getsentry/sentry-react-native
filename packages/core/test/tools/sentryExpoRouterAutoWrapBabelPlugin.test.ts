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
    expect(out).toMatch(
      /const\s+_wrappedErrorBoundary\w*\s*=\s*__sentryWrapExpoRouterErrorBoundary\(__sentryOriginalExpoErrorBoundary\)/,
    );
    expect(out).toMatch(/export\s*\{\s*_wrappedErrorBoundary\w*\s+as\s+ErrorBoundary\s*\}/);
  });

  it('preserves the user-chosen name on aliased re-exports', () => {
    const out = transform(`export { ErrorBoundary as RouteErrorBoundary } from 'expo-router';`);
    expect(out).toMatch(/export\s*\{\s*_wrappedRouteErrorBoundary\w*\s+as\s+RouteErrorBoundary\s*\}/);
  });

  it('keeps sibling specifiers untouched on mixed re-exports', () => {
    const out = transform(`export { ErrorBoundary, Stack } from 'expo-router';`);
    expect(out).toMatch(/export\s*\{\s*_wrappedErrorBoundary\w*\s+as\s+ErrorBoundary\s*\}/);
    expect(out).toMatch(/export\s*\{\s*Stack\s*\}\s*from\s*['"]expo-router['"]/);
  });

  it('does not clash with an existing local `ErrorBoundary` binding in the same file', () => {
    // The user uses ErrorBoundary locally AND re-exports it for Expo Router.
    // Declaring `export const ErrorBoundary = ...` would duplicate the binding
    // introduced by the existing `import { ErrorBoundary }` line and fail to
    // compile. The wrapped value must use a unique local instead.
    const src = [
      `import { ErrorBoundary } from 'expo-router';`,
      `const Local = ErrorBoundary;`,
      `export { ErrorBoundary } from 'expo-router';`,
    ].join('\n');
    const out = transform(src);
    // The wrapped value uses a fresh uid — no second `const ErrorBoundary =` is emitted.
    expect(out).not.toMatch(/const\s+ErrorBoundary\s*=/);
    expect(out).toMatch(/export\s*\{\s*_wrappedErrorBoundary\w*\s+as\s+ErrorBoundary\s*\}/);
  });

  it('hoists helper imports to the top of the file, never mid-file', () => {
    // A common shape: imports + non-import statements + the boundary re-export.
    // Mid-file `import` declarations are invalid in strict ESM environments
    // (e.g. Hermes), so the helpers must be pushed up to the imports block.
    const src = [
      `import { Stack } from 'expo-router';`,
      `const greeting = 'hi';`,
      `export { ErrorBoundary } from 'expo-router';`,
    ].join('\n');
    const out = transform(src);
    const lines = out
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);
    const firstNonImport = lines.findIndex(l => !l.startsWith('import'));
    const helperLineIndexes = lines
      .map((l, i) =>
        (l.includes('__sentryOriginalExpoErrorBoundary') || l.includes('__sentryWrapExpoRouterErrorBoundary')) &&
        l.startsWith('import')
          ? i
          : -1,
      )
      .filter(i => i !== -1);
    expect(helperLineIndexes.length).toBe(2);
    helperLineIndexes.forEach(i => expect(i).toBeLessThan(firstNonImport));
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
    expect(out).toMatch(/export\s*\{\s*_wrappedErrorBoundary\w*\s+as\s+ErrorBoundary\s*\}/);
    expect(out).toMatch(/export\s*\{\s*_wrappedOther\w*\s+as\s+Other\s*\}/);
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

  it("preserves a leading 'use client' directive", () => {
    // Helper imports must not be hoisted above the directive prologue, or
    // Expo Web / RSC tooling will stop treating the file as a client module.
    const src = `'use client';\nexport { ErrorBoundary } from 'expo-router';`;
    const out = transform(src);
    expect(out.trimStart()).toMatch(/^['"]use client['"];/);
  });

  it('skips files inside node_modules', () => {
    const out = transform(`export { ErrorBoundary } from 'expo-router';`, '/proj/node_modules/expo-router/build/x.js');
    expect(out).not.toContain('@sentry/react-native');
    expect(out).toMatch(/export\s*\{\s*ErrorBoundary\s*\}\s*from\s*['"]expo-router['"]/);
  });
});
