import { logger } from '@sentry/utils';
import { mkdirSync,readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { argv, exit } from 'process';

import ModulesCollector from './ModulesCollector';

const sourceMapPath: string | undefined = argv[2]; // eslint-disable-line @typescript-eslint/no-unsafe-member-access
const outputModulesPath: string | undefined = argv[3]; // eslint-disable-line @typescript-eslint/no-unsafe-member-access
const modulesPaths: string[] = argv[4] // eslint-disable-line @typescript-eslint/no-unsafe-member-access
  ? argv[4].split(',') // eslint-disable-line @typescript-eslint/no-unsafe-member-access
  : [];

if (!sourceMapPath) {
  exitGracefully('First argument `source-map-path` is missing!');
}
if (!outputModulesPath) {
  exitGracefully('Second argument `modules-output-path` is missing!');
}
if (modulesPaths.length === 0) {
  exitGracefully('Third argument `modules-paths` is missing!');
}

const map: { sources?: string[] } = JSON.parse(readFileSync(sourceMapPath, 'utf8'));
if (!map.sources) {
  exitGracefully(`Modules not collected. No sources found in the source map (${sourceMapPath})!`);
}

const sources: string[] = map.sources;
const modules = ModulesCollector.collect(sources, modulesPaths);

mkdirSync(dirname(outputModulesPath), { recursive: true });
writeFileSync(outputModulesPath, JSON.stringify(modules, null, 2));

function exitGracefully(message: string): never {
  logger.error(message);
  exit(0);
};
