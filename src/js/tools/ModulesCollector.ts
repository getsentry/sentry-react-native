import { existsSync, readFileSync } from 'fs';
import { posix, sep } from 'path';
const { dirname, join, resolve } = posix;

interface Package {
  name?: string,
  version?: string,
}

/**
 * Collects JS modules from source paths.
 */
export default class ModulesCollector {

  /** Collect method */
  public static collect(sources: string[], modulesPaths: string[]): Record<string, string> {
    modulesPaths = modulesPaths.map((modulesPath) => resolve(modulesPath.split(sep).join(posix.sep)));

    const infos: Record<string, string> = {};
    const seen: Record<string, true> = {};

    sources.forEach((path: string) => {
      let dir = path; // included source file path
      let candidate: Package | null = null;

      /** Traverse directories upward in the search of all package.json files */
      const upDirSearch = (): void => {
        const parentDir = dir;
        dir = dirname(parentDir);

        if (modulesPaths.includes(resolve(dir))) {
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
        } catch (_oO) {
          // do-nothing
        }

        return upDirSearch(); // processed package.json file, continue up search
      };

      upDirSearch();
    });

    return infos;
  }

}
