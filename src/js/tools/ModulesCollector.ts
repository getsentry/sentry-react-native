import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

/**
 * Collects JS modules from source paths.
 */
export default class ModulesCollector {

  /** Collect method */
  public static collect(sources: string[], modulesPaths: string[]): Record<string, string> {
    const infos: Record<string, string> = {};
    const seen: Record<string, true> = {};

    sources.forEach((path: string) => {
      let dir = path; // included source file path

      /** Traverse directories upward in the search of all package.json files */
      const upDirSearch = (): void => {
        const parentDir = dir;
        dir = dirname(parentDir);

        const upDir = dirname(resolve(dir));
        if (
          !dir ||
          parentDir === dir ||
          seen[dir]
        ) {
          return;
        }
        seen[dir] = true;

        const pkgPath = join(dir, 'package.json');
        if (!existsSync(pkgPath)
          ||!modulesPaths.includes(upDir)) {
          // fast-forward if the package.json doesn't exist
          // or the dir is not direct child of the modules path
          return upDirSearch();
        }

        try {
          const info: { name?: string, version?: string } = JSON.parse(readFileSync(pkgPath, 'utf8'));
          if (info.name && info.version) {
            infos[info.name] = info.version;
          } else if (info.name) {
            infos[info.name] = 'unknown';
          }
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
