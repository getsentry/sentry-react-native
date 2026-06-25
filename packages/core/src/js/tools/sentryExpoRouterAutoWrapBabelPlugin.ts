/* eslint-disable @typescript-eslint/no-explicit-any */
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
 * The transform is idempotent: a file that has already been transformed
 * (recognised by the marker import) is left alone on subsequent runs.
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

        // Idempotency: if we've already injected the wrap import in this file,
        // don't re-transform any re-exports below it.
        const program = path.findParent(p => p.isProgram()) as NodePath<BabelTypes.Program> | null;
        if (program && hasMarkerImport(t, program)) {
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

        // Build the replacement nodes.
        const originalImport = t.importDeclaration(
          [t.importSpecifier(t.identifier(ORIGINAL_BOUNDARY_LOCAL), t.identifier(BOUNDARY_EXPORT))],
          t.stringLiteral(EXPO_ROUTER_PACKAGE),
        );
        const wrapImport = t.importDeclaration(
          [t.importSpecifier(t.identifier(WRAP_FN_LOCAL), t.identifier('wrapExpoRouterErrorBoundary'))],
          t.stringLiteral(SENTRY_PACKAGE),
        );
        const wrappedExport = t.exportNamedDeclaration(
          t.variableDeclaration('const', [
            t.variableDeclarator(
              t.identifier(exportedName),
              t.callExpression(t.identifier(WRAP_FN_LOCAL), [t.identifier(ORIGINAL_BOUNDARY_LOCAL)]),
            ),
          ]),
          [],
        );

        const remainingSpecifiers = node.specifiers.filter((_, i) => i !== boundarySpecifierIndex);

        const replacements: BabelTypes.Statement[] = [originalImport, wrapImport, wrappedExport];
        if (remainingSpecifiers.length > 0) {
          replacements.push(t.exportNamedDeclaration(null, remainingSpecifiers, t.cloneNode(node.source)));
        }

        path.replaceWithMultiple(replacements);
      },
    },
  };
}

function hasMarkerImport(t: typeof BabelTypes, program: NodePath<BabelTypes.Program>): boolean {
  return program.node.body.some(stmt => {
    if (!t.isImportDeclaration(stmt) || stmt.source.value !== SENTRY_PACKAGE) {
      return false;
    }
    return stmt.specifiers.some(
      s => t.isImportSpecifier(s) && t.isIdentifier(s.local) && s.local.name === WRAP_FN_LOCAL,
    );
  });
}
