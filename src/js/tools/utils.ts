import * as crypto from 'crypto';
import type { Module, ReadOnlyGraph, SerializerOptions } from 'metro';

// Variant of MixedOutput
// https://github.com/facebook/metro/blob/9b85f83c9cc837d8cd897aa7723be7da5b296067/packages/metro/src/DeltaBundler/types.flow.js#L21
export type VirtualJSOutput = {
  type: 'js/script/virtual';
  data: {
    code: string;
    lineCount: number;
    map: [];
  };
};

export type Bundle = {
  modules: Array<[id: number, code: string]>;
  post: string;
  pre: string;
};

export type SentryMetroSerializerOptionsExtras = {
  sentryBundleCallback?: (bundle: Bundle) => Bundle;
};

export type SerializedBundle = { code: string; map: string };

export type MetroSerializerOutput = string | SerializedBundle | Promise<string | SerializedBundle>;

export type MetroSerializer = (
  entryPoint: string,
  preModules: ReadonlyArray<Module>,
  graph: ReadOnlyGraph,
  options: SerializerOptions & SentryMetroSerializerOptionsExtras,
) => MetroSerializerOutput;

/**
 * Returns minified Debug ID code snippet.
 */
export function createDebugIdSnippet(debugId: string): string {
  return `var _sentryDebugIds={},_sentryDebugIdIdentifier="";void 0===_sentryDebugIds&&(_sentryDebugIds={});try{var stack=(new Error).stack;stack&&(_sentryDebugIds[stack]="${debugId}",_sentryDebugIdIdentifier="sentry-dbid-${debugId}")}catch(e){}`;
}

/**
 * Deterministically hashes a string and turns the hash into a uuid.
 *
 * https://github.com/getsentry/sentry-javascript-bundler-plugins/blob/58271f1af2ade6b3e64d393d70376ae53bc5bd2f/packages/bundler-plugin-core/src/utils.ts#L174
 */
export function stringToUUID(str: string): string {
  const md5sum = crypto.createHash('md5');
  md5sum.update(str);
  const md5Hash = md5sum.digest('hex');

  // Position 16 is fixed to either 8, 9, a, or b in the uuid v4 spec (10xx in binary)
  // RFC 4122 section 4.4
  const v4variant = ['8', '9', 'a', 'b'][md5Hash.substring(16, 17).charCodeAt(0) % 4] as string;

  return `${md5Hash.substring(0, 8)}-${md5Hash.substring(8, 12)}-4${md5Hash.substring(
    13,
    16,
  )}-${v4variant}${md5Hash.substring(17, 20)}-${md5Hash.substring(20)}`.toLowerCase();
}

/**
 * Looks for a particular string pattern (`sdbid-[debug ID]`) in the bundle
 * source and extracts the bundle's debug ID from it.
 *
 * The string pattern is injected via the debug ID injection snipped.
 *
 * https://github.com/getsentry/sentry-javascript-bundler-plugins/blob/40f918458ed449d8b3eabaf64d13c08218213f65/packages/bundler-plugin-core/src/debug-id-upload.ts#L293-L294
 */
export function determineDebugIdFromBundleSource(code: string): string | undefined {
  const match = code.match(
    /sentry-dbid-([0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12})/,
  );
  return match ? match[1] : undefined;
}
