/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { argv } from 'process';

import ModulesCollector from './ModulesCollector';

const sourceMapPath: string | undefined = argv[2];
const outputModulesPath: string | undefined = argv[3];
const modulesPaths: string[] = argv[4] ? argv[4].split(',') : [];

ModulesCollector.run({ sourceMapPath, outputModulesPath, modulesPaths });
