import { logger } from '@sentry/utils';
import { existsSync, readFileSync, rmdirSync, unlinkSync } from 'fs';
import { dirname } from 'path';

jest.mock('@sentry/utils');
(logger.enable as jest.Mock).mockImplementation(() => {});

import ModulesCollector from '../../src/js/tools/ModulesCollector';

describe('collectModules', () => {
  test('should collect modules from multiple modules paths', () => {
    const modules = ModulesCollector.collect(
      [
        `${__dirname}/fixtures/root-module/lib/rootModule.js`,
        `${__dirname}/fixtures/root-module/modules/module1/lib/module1.js`,
        `${__dirname}/fixtures/root-module/modules/module1/modules/not-collected/lib/notCollected.js`,
        `${__dirname}/fixtures/root-module/modules/module2/module2.js`,
        `${__dirname}/fixtures/root-module/modules/@organization/module3/module3.js`,
      ],
      [`${__dirname}/fixtures/root-module/modules`, `${__dirname}/fixtures`],
    );

    expect(modules).toEqual({
      'root-module': 'root-module-version',
      'module-1': 'module-1-version',
      'module-2': 'unknown',
      'module-3': 'module-3-version',
    });
  });

  test('should collect modules from single module path', () => {
    const modules = ModulesCollector.collect(
      [
        `${__dirname}/fixtures/root-module/lib/rootModule.js`,
        `${__dirname}/fixtures/root-module/modules/module1/lib/module1.js`,
        `${__dirname}/fixtures/root-module/modules/module1/modules/not-collected/lib/notCollected.js`,
        `${__dirname}/fixtures/root-module/modules/module2/module2.js`,
      ],
      [`${__dirname}/fixtures/root-module/modules`],
    );

    expect(modules).toEqual({
      'module-1': 'module-1-version',
      'module-2': 'unknown',
    });
  });

  test('should skip non string source value', () => {
    const modules = ModulesCollector.collect([1, {}], [`${__dirname}/fixtures/root-module/modules`]);

    expect(modules).toEqual({});
  });

  test('should gracefully return if source map does not exist', () => {
    const mockCollect = jest.fn().mockReturnValue({});
    ModulesCollector.run({
      sourceMapPath: 'not-exist',
      outputModulesPath: `${__dirname}/fixtures/mock.json`,
      modulesPaths: [`${__dirname}/fixtures/root-module/modules`],
      collect: mockCollect,
    });

    expect(mockCollect).not.toHaveBeenCalled();
  });

  test('should gracefully return if one of the modules paths does not exist', () => {
    const mockCollect = jest.fn().mockReturnValue({});
    ModulesCollector.run({
      sourceMapPath: `${__dirname}/fixtures/mock.map`,
      outputModulesPath: `${__dirname}/fixtures/mock.json`,
      modulesPaths: [`${__dirname}/fixtures/root-module/modules`, 'not-exist'],
      collect: mockCollect,
    });

    expect(mockCollect).not.toHaveBeenCalled();
  });

  describe('write output json', () => {
    const outputModulesPath = `${__dirname}/assets/output.json`;

    const cleanUp = () => {
      if (existsSync(outputModulesPath)) {
        unlinkSync(outputModulesPath);
        rmdirSync(dirname(outputModulesPath));
      }
    };

    beforeEach(cleanUp);
    afterEach(cleanUp);

    test('should write output to file', () => {
      ModulesCollector.run({
        sourceMapPath: `${__dirname}/fixtures/mock.map`,
        outputModulesPath,
        modulesPaths: [`${__dirname}/fixtures/root-module/modules`],
      });

      expect(existsSync(outputModulesPath)).toEqual(true);
      expect(readFileSync(outputModulesPath, 'utf8')).toEqual('{}');
    });
  });
});
