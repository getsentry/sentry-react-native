import { parseHermesStackFrameFunctionName } from '../../src/js/profiling/hermes';

describe('hermes', () => {
  describe('parseHermesStackFrameName', () => {
    test('parses function name and file name', () => {
      expect(parseHermesStackFrameFunctionName('fooA(/absolute/path/main.jsbundle:1610:33)')).toEqual('fooA');
    });
    test('parse hermes root stack frame', () => {
      expect(parseHermesStackFrameFunctionName('[root]')).toEqual('[root]');
    });
    test('parse only file name', () => {
      expect(parseHermesStackFrameFunctionName('(/absolute/path/jsbundle:1610:33)')).toEqual('');
    });
    test('parse only function name', () => {
      expect(parseHermesStackFrameFunctionName('fooA')).toEqual('fooA');
    });
  });
});
