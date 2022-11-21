import { readFileSync, writeFileSync } from 'fs';
import { argv } from 'process';

import ModulesCollector from './ModulesCollector';

const sourceMapPath: string | undefined = argv[2]; // eslint-disable-line @typescript-eslint/no-unsafe-member-access
const outputModulesPath: string | undefined = argv[3]; // eslint-disable-line @typescript-eslint/no-unsafe-member-access
const modulesPaths: string[] = argv[4] // eslint-disable-line @typescript-eslint/no-unsafe-member-access
  ? argv[4].split(',') // eslint-disable-line @typescript-eslint/no-unsafe-member-access
  : [];

if (!sourceMapPath) {
  throw new Error('First argument `source-map-path` is missing!');
}
if (!outputModulesPath) {
  throw new Error('Second argument `modules-output-path` is missing!');
}
if (modulesPaths.length === 0) {
  throw new Error('Third argument `modules-paths` is missing!');
}

const map: { sources?: string[] } = JSON.parse(readFileSync(sourceMapPath, 'utf8'));
if (!map.sources) {
  throw new Error('No sources found in source map!');
}

const sources: string[] = map.sources;
const modules = ModulesCollector.collect(sources, modulesPaths);

writeFileSync(outputModulesPath, JSON.stringify(modules, null, 2));
