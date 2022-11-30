/* eslint-disable no-console */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { posix, sep } from 'path';

const { dirname, join, resolve, sep: posixSep } = posix;

interface Package {
  name?: string,
  version?: string,
}

/**
 * Collects JS modules from source paths.
 */
export default class ModulesCollector {

  /** Collect method */
  public static collect(sources: unknown[], modulesPaths: string[]): Record<string, string> {
    const normalizedModulesPaths = modulesPaths.map((modulesPath) => resolve(modulesPath.split(sep).join(posixSep)));

    const infos: Record<string, string> = {};
    const seen: Record<string, true> = {};

    sources.forEach((path: unknown) => {
      if (typeof path !== 'string') {
        return;
      }

      let dir = path; // included source file path
      let candidate: Package | null = null;

      /** Traverse directories upward in the search of all package.json files */
      const upDirSearch = (): void => {
        const parentDir = dir;
        dir = dirname(parentDir);

        if (normalizedModulesPaths.includes(resolve(dir))) {
          if (candidate?.name && candidate?.version) {
            infos[candidate.name] = candidate.version;
          } else if (candidate?.name) {
            infos[candidate.name] = 'unknown';
          }
          return;
        }

        if (
          !dir ||
          parentDir === dir ||
          seen[dir]
        ) {
          return;
        }
        seen[dir] = true;

        const pkgPath = join(dir, 'package.json');
        if (!existsSync(pkgPath)) {
          // fast-forward if the package.json doesn't exist
          return upDirSearch();
        }

        try {
          const info: Package = JSON.parse(readFileSync(pkgPath, 'utf8'));
          candidate = {
            name: info.name,
            version: info.version,
          };
        } catch (error) {
          console.warn(`Failed to read ${pkgPath}`);
        }

        return upDirSearch(); // processed package.json file, continue up search
      };

      upDirSearch();
    });

    return infos;
  }

  /**
   * Runs collection of modules.
   */
  public static run({
    sourceMapPath,
    outputModulesPath,
    modulesPaths,
    collect,
  }: Partial<{
    sourceMapPath: string,
    outputModulesPath: string,
    modulesPaths: string[],
    collect: (sources: unknown[], modulesPaths: string[]) => Record<string, string>,
  }>): void {
    if (!sourceMapPath) {
      console.error('First argument `source-map-path` is missing!');
      return;
    }
    if (!outputModulesPath) {
      console.error('Second argument `modules-output-path` is missing!');
      return;
    }
    if (!modulesPaths || modulesPaths.length === 0) {
      console.error('Third argument `modules-paths` is missing!');
      return;
    }

    console.info('Reading source map from', sourceMapPath);
    console.info('Saving modules to', outputModulesPath);
    console.info('Resolving modules from paths', outputModulesPath);

    if (!existsSync(sourceMapPath)) {
      console.error(`Source map file does not exist at ${sourceMapPath}`);
      return;
    }
    modulesPaths.forEach((modulesPath) => {
      if (!existsSync(modulesPath)) {
        console.error(`Modules path does not exist at ${modulesPath}`);
        return;
      }
    });

    const map: { sources?: unknown } = JSON.parse(readFileSync(sourceMapPath, 'utf8'));
    if (!map.sources || !Array.isArray(map.sources)) {
      console.error(`Modules not collected. No sources found in the source map (${sourceMapPath})!`);
      return;
    }

    const sources: unknown[] = map.sources;
    const modules = collect
      ? collect(sources, modulesPaths)
      : ModulesCollector.collect(sources, modulesPaths);

    const outputModulesDirPath = dirname(outputModulesPath);
    if (!existsSync(outputModulesDirPath)) {
      mkdirSync(outputModulesDirPath, { recursive: true });
    }
    writeFileSync(outputModulesPath, JSON.stringify(modules, null, 2));
    console.info(`Modules collected and saved to: ${outputModulesPath}`);
  }

}
