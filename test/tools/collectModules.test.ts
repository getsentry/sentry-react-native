import ModulesCollector from '../../src/js/tools/ModulesCollector';

describe('collectModules', () => {
  test('should collect modules from multiple modules paths', () => {
    const modules = ModulesCollector.collect(
      [
        `${__dirname}/fixtures/root-module/lib/rootModule.js`,
        `${__dirname}/fixtures/root-module/modules/module1/lib/module1.js`,
        `${__dirname}/fixtures/root-module/modules/module1/modules/not-collected/lib/notCollected.js`,
        `${__dirname}/fixtures/root-module/modules/module2/module2.js`,
      ],
      [
        `${__dirname}/fixtures/root-module/modules`,
        `${__dirname}/fixtures`,
      ],
    );

    expect(modules).toEqual({
      'root-module': 'root-module-version',
      'module-1': 'module-1-version',
      'module-2': 'unknown'
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
      [
        `${__dirname}/fixtures/root-module/modules`,
      ],
    );

    expect(modules).toEqual({
      'module-1': 'module-1-version',
      'module-2': 'unknown'
    });
  });
});
