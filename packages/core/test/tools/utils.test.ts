import type { Module } from 'metro';
import * as countLines from 'metro/src/lib/countLines';
import type { VirtualJSOutput } from '../../src/js/tools/utils';
import { createSet, getExpoConfig, prependModule } from '../../src/js/tools/utils';

const mockedExpoConfigRequire = jest.fn();

jest.mock('@expo/config', () => ({
  getConfig: mockedExpoConfigRequire,
}));

describe('Sentry Metro Tools Utils', () => {
  describe('prependModule', () => {
    test('module is added to position 0 if no prelude module', () => {
      const module = mockModule('testModule.js', 'console.log("test");');
      const preModules = [mockModule('otherModule.js', 'console.log("other");')];

      const result = prependModule(preModules, module);

      expect(result[0]).toEqual(module);
      expect(result[1]).toEqual(preModules[0]);
    });

    test('module is added after prelude', () => {
      const module = mockModule('testModule.js', 'console.log("test");');
      const preludeModule = mockModule('__prelude__', 'console.log("prelude");');
      const preModules = [preludeModule, mockModule('otherModule.js', 'console.log("other");')];

      const result = prependModule(preModules, module);

      expect(result[0]).toEqual(preludeModule);
      expect(result[1]).toEqual(module);
      expect(result[2]).toEqual(preModules[1]);
    });
  });

  describe('getExpoConfig', () => {
    test('returns empty object if @expo/config is not available', () => {
      mockedExpoConfigRequire.mockImplementation(() => {
        throw new Error('Module not found');
      });

      const result = getExpoConfig('/some/project/root');
      expect(result).toStrictEqual({});
    });

    test('returns config with name and version', () => {
      mockedExpoConfigRequire.mockReturnValue({
        exp: {
          name: 'TestApp',
          version: '1.0.0',
        },
      });

      const result = getExpoConfig('/some/project/root');
      expect(result).toEqual({ name: 'TestApp', version: '1.0.0' });
    });

    test('returns object with undefined(s) if name or version is not a string', () => {
      mockedExpoConfigRequire.mockReturnValue({
        exp: {
          name: 123,
          version: null,
        },
      });

      const result = getExpoConfig('/some/project/root');
      expect(result).toEqual({
        name: undefined,
        version: undefined,
      });
    });

    test('returns empty object if getConfig is not available', () => {
      mockedExpoConfigRequire.mockReturnValue({});

      const result = getExpoConfig('/some/project/root');
      expect(result).toEqual({});
    });
  });
});

function mockModule(path: string, code: string): Module<VirtualJSOutput> {
  return {
    dependencies: new Map(),
    getSource: () => Buffer.from(code),
    inverseDependencies: createSet(),
    path,
    output: [
      {
        type: 'js/script/virtual',
        data: {
          code,
          lineCount: countLines(code),
          map: [],
        },
      },
    ],
  };
}
