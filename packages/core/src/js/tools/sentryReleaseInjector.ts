// eslint-disable-next-line import/no-extraneous-dependencies
import type { MixedOutput, Module, ReadOnlyGraph } from 'metro';
import type { VirtualJSOutput } from './utils';
import { createVirtualJSModule, getExpoConfig, prependModule } from './utils';

const RELEASE_CONSTANTS_MODULE_PATH = '__sentryReleaseConstants__';

/**
 * Adds Sentry Release constants to the bundle.
 */
export const unstableReleaseConstantsPlugin =
  (projectRoot: string) =>
  ({ graph, premodules }: { graph: ReadOnlyGraph<MixedOutput>; premodules: Module[]; debugId?: string }): Module[] => {
    const notWeb = graph.transformOptions.platform !== 'web';
    if (notWeb) {
      return premodules;
    }

    const { name, version } = getExpoConfig(projectRoot);

    if (!name || !version) {
      return premodules;
    }

    return prependModule(
      premodules,
      createSentryReleaseModule({
        name,
        version,
      }),
    );
  };

function createSentryReleaseModule({
  name,
  version,
}: {
  name: string;
  version: string;
}): Module<VirtualJSOutput> & { setSource: (code: string) => void } {
  return createVirtualJSModule(RELEASE_CONSTANTS_MODULE_PATH, createReleaseConstantsSnippet({ name, version }));
}

function createReleaseConstantsSnippet({ name, version }: { name: string; version: string }): string {
  return `var SENTRY_RELEASE;SENTRY_RELEASE={name: "${name}", version: "${version}"};`;
}
