import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { argv, cwd } from 'process';

const sourceMapPath: string | undefined = argv[2]; // eslint-disable-line @typescript-eslint/no-unsafe-member-access
const outputModulesPath: string | undefined = argv[3]; // eslint-disable-line @typescript-eslint/no-unsafe-member-access

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

const excludedPaths: string[] = [cwd()];
const sources: string[] = map.sources;
const modules = collectModules(sources, excludedPaths);

writeFileSync(outputModulesPath, JSON.stringify(modules, null, 2));

function collectModules(sources: string[], excludedPaths: string[]): Record<string, string[]> {
  const infos: Record<string, string[]> = {};
  const seen: Record<string, true> = {};

  sources.forEach((path: string) => {
    let dir = path; // included source file path

    /** Traverse directories upward in the search of all package.json files */
    const upDirSearch = (): void => {
      const parentDir = dir;
      dir = dirname(parentDir);

      if (
        !dir ||
        parentDir === dir ||
        seen[dir] ||
        excludedPaths.includes(dir)
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
        const info: { name?: string, version?: string } = JSON.parse(readFileSync(pkgPath, 'utf8'));
        if (info.name) {
          infos[info.name] = infos[info.name] && info.version
            ? [...infos[info.name], info.version]
            : info.version
              ? [info.version]
              : [];
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
