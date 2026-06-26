import type { NodePath, PluginObj, PluginPass, types as BabelTypes } from '@babel/core';

/**
 * Babel plugin that auto-wraps Expo Router's per-route `ErrorBoundary` so the
 * Sentry SDK captures render-phase errors that hit the fallback without
 * requiring the user to change their route file.
 *
 * It rewrites:
 *
 * ```ts
 * export { ErrorBoundary } from 'expo-router';
 * ```
 *
 * into:
 *
 * ```ts
 * import { ErrorBoundary as __sentryOriginalExpoErrorBoundary } from 'expo-router';
 * import { wrapExpoRouterErrorBoundary as __sentryWrapExpoRouterErrorBoundary } from '@sentry/react-native';
 * export const ErrorBoundary = __sentryWrapExpoRouterErrorBoundary(__sentryOriginalExpoErrorBoundary);
 * ```
 *
 * Aliased re-exports (`export { ErrorBoundary as Foo } from 'expo-router'`)
 * are preserved — the wrapped export keeps the user-chosen name. Mixed
 * re-exports such as
 * `export { ErrorBoundary, Stack } from 'expo-router'` keep the non-boundary
 * specifiers in place.
 *
 * The transform is structurally idempotent: after the rewrite the re-export
 * is no longer an `export ... from 'expo-router'`, so a second pass over the
 * same file finds nothing to transform.
 *
 * Files inside `node_modules` are never transformed.
 */

const ORIGINAL_BOUNDARY_LOCAL = '__sentryOriginalExpoErrorBoundary';
const WRAP_FN_LOCAL = '__sentryWrapExpoRouterErrorBoundary';
const SENTRY_PACKAGE = '@sentry/react-native';
const EXPO_ROUTER_PACKAGE = 'expo-router';
const BOUNDARY_EXPORT = 'ErrorBoundary';

interface BabelApi {
  types: typeof BabelTypes;
}

export default function sentryExpoRouterAutoWrapBabelPlugin({ types: t }: BabelApi): PluginObj {
  return {
    name: 'sentry-expo-router-auto-wrap-error-boundary',
    visitor: {
      ExportNamedDeclaration(path: NodePath<BabelTypes.ExportNamedDeclaration>, state: PluginPass) {
        const node = path.node;
        if (!node.source || node.source.value !== EXPO_ROUTER_PACKAGE) {
          return;
        }

        const filename = (state.file?.opts?.filename as string | undefined) ?? '';
        if (filename.includes('node_modules')) {
          return;
        }

        const boundarySpecifierIndex = node.specifiers.findIndex(
          s => t.isExportSpecifier(s) && t.isIdentifier(s.local) && s.local.name === BOUNDARY_EXPORT,
        );
        if (boundarySpecifierIndex === -1) {
          return;
        }

        const boundarySpecifier = node.specifiers[boundarySpecifierIndex] as BabelTypes.ExportSpecifier;
        const exportedName = t.isIdentifier(boundarySpecifier.exported)
          ? boundarySpecifier.exported.name
          : boundarySpecifier.exported.value;

        // Hoist the two helper imports to the top of the Program body so
        // they sit alongside the file's other `import` declarations rather
        // than landing mid-file. Some toolchains (e.g. Hermes) are strict
        // about import placement, and mid-file imports are also harder to
        // read. Inject once per file so a second wrap reuses the bindings.
        const HELPERS_KEY = 'sentryAutoWrapHelpersInjected';
        if (state.get(HELPERS_KEY) !== true) {
          const program = path.scope.getProgramParent().path as NodePath<BabelTypes.Program>;
          program.unshiftContainer('body', [
            t.importDeclaration(
              [t.importSpecifier(t.identifier(ORIGINAL_BOUNDARY_LOCAL), t.identifier(BOUNDARY_EXPORT))],
              t.stringLiteral(EXPO_ROUTER_PACKAGE),
            ),
            t.importDeclaration(
              [t.importSpecifier(t.identifier(WRAP_FN_LOCAL), t.identifier('wrapExpoRouterErrorBoundary'))],
              t.stringLiteral(SENTRY_PACKAGE),
            ),
          ]);
          state.set(HELPERS_KEY, true);
        }

        // Generate a unique local binding for the wrapped boundary instead of
        // declaring `const <exportedName> = ...` directly. That avoids clashing
        // with an existing top-level binding of the same name in the file
        // (e.g. `import { ErrorBoundary } from 'expo-router'` used elsewhere)
        // which would otherwise produce a duplicate-binding compile error.
        const wrappedLocal = path.scope.generateUidIdentifier(`wrapped${exportedName}`);
        const replacements: BabelTypes.Statement[] = [
          t.variableDeclaration('const', [
            t.variableDeclarator(
              wrappedLocal,
              t.callExpression(t.identifier(WRAP_FN_LOCAL), [t.identifier(ORIGINAL_BOUNDARY_LOCAL)]),
            ),
          ]),
          t.exportNamedDeclaration(null, [t.exportSpecifier(t.cloneNode(wrappedLocal), t.identifier(exportedName))]),
        ];

        const remainingSpecifiers = node.specifiers.filter((_, i) => i !== boundarySpecifierIndex);
        if (remainingSpecifiers.length > 0) {
          replacements.push(t.exportNamedDeclaration(null, remainingSpecifiers, t.cloneNode(node.source)));
        }

        path.replaceWithMultiple(replacements);
      },
    },
  };
}
