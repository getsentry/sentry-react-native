import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { argv } from 'process';

const sourceMapPath: string | undefined = argv[2]; // eslint-disable-line @typescript-eslint/no-unsafe-member-access
const outputModulesPath: string | undefined = argv[3]; // eslint-disable-line @typescript-eslint/no-unsafe-member-access
const modulesPaths: string[] = argv[4] // eslint-disable-line @typescript-eslint/no-unsafe-member-access
  ? argv[4].split(',').map((p: string) => resolve(p)) // eslint-disable-line @typescript-eslint/no-unsafe-member-access
  : [];

if (!sourceMapPath) {
  throw new Error('First argument `source-map-path` is missing!');
}
if (!outputModulesPath) {
  throw new Error('Second argument `modules-output-path` is missing!');
}

const map: { sources?: string[] } = JSON.parse(readFileSync(sourceMapPath, 'utf8'));
if (!map.sources) {
  throw new Error('No sources found in source map!');
}

const sources: string[] = map.sources;
const modules = collectModules(sources, modulesPaths);

writeFileSync(outputModulesPath, JSON.stringify(modules, null, 2));

function collectModules(sources: string[], modulesPaths: string[]): Record<string, string> {
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
          infos[info.name] = "unknown";
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
