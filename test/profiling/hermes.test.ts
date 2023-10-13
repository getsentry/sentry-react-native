import type { ParsedHermesStackFrame } from '../../src/js/profiling/hermes';
import { parseHermesJSStackFrame } from '../../src/js/profiling/hermes';

describe('hermes', () => {
  describe('parseHermesStackFrameName', () => {
    test('parses function name and file name', () => {
      expect(
        parseHermesJSStackFrame({
          name: 'fooA(/absolute/path/main.jsbundle:1610:33)',
          line: '1610',
          column: '33',
          category: 'JavaScript',
        }),
      ).toEqual(<ParsedHermesStackFrame>{
        function: 'fooA',
        file: 'app:///main.jsbundle',
        lineno: 1610,
        colno: 33,
      });
    });
    test('parse hermes root stack frame', () => {
      expect(
        parseHermesJSStackFrame({
          name: '[root]',
          category: 'root',
        }),
      ).toEqual(
        expect.objectContaining(<ParsedHermesStackFrame>{
          function: '[root]',
        }),
      );
    });
    test('parse only file name', () => {
      expect(
        parseHermesJSStackFrame({
          name: '(/absolute/path/main.jsbundle:1610:33)',
          line: '1610',
          column: '33',
          category: 'JavaScript',
        }),
      ).toEqual(<ParsedHermesStackFrame>{
        function: 'anonymous',
        file: 'app:///main.jsbundle',
        lineno: 1610,
        colno: 33,
      });
    });
    test('parse only function name', () => {
      expect(
        parseHermesJSStackFrame({
          name: 'fooA',
          category: 'JavaScript',
        }),
      ).toEqual(
        expect.objectContaining(<ParsedHermesStackFrame>{
          function: 'fooA',
          file: 'app:///main.jsbundle',
        }),
      );
    });
  });
});
