import { parseHermesStackFrameName } from '../../../src/js/profiling/hermes';

describe('hermes', () => {
  describe('parseHermesStackFrameName', () => {
    test('parses function name and file name', () => {
      expect(parseHermesStackFrameName('fooA(/absolute/path/main.jsbundle:1610:33)')).toEqual({
        function: 'fooA',
        fileName: 'main.jsbundle',
      });
    });
    test('parse hermes root stack frame', () => {
      expect(parseHermesStackFrameName('[root]')).toEqual({ function: '[root]' });
    });
    test('parse only file name', () => {
      expect(parseHermesStackFrameName('(/absolute/path/main.jsbundle:1610:33)')).toEqual({
        fileName: 'main.jsbundle',
        function: '',
      });
    });
    test('parse only file name no line or col num', () => {
      expect(parseHermesStackFrameName('(/absolute/path/main.jsbundle)')).toEqual({
        fileName: 'main.jsbundle',
        function: '',
      });
    });
    test('parse only function name', () => {
      expect(parseHermesStackFrameName('fooA')).toEqual({ function: 'fooA' });
    });
  });
});
