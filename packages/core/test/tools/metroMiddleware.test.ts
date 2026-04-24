import type { StackFrame } from '@sentry/core';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

import * as openUrlMiddlewareModule from '../../src/js/metro/openUrlMiddleware';
import * as metroMiddleware from '../../src/js/tools/metroMiddleware';

const { withSentryMiddleware, createSentryMetroMiddleware, createStackFramesContextMiddleware } = metroMiddleware;

const TEST_PROJECT_ROOT = path.resolve('/tmp/sentry-rn-test-project');

jest.mock('../../src/js/tools/metroMiddleware', () => jest.requireActual('../../src/js/tools/metroMiddleware'));
jest.mock('fs', () => {
  return {
    readFile: jest.fn(),
    realpath: jest.fn((p: string, cb: (err: NodeJS.ErrnoException | null, resolved: string) => void) => cb(null, p)),
    realpathSync: jest.fn((p: string) => p),
  };
});

describe('metroMiddleware', () => {
  describe('withSentryMiddleware', () => {
    let originalEnhanceMiddleware: jest.Mock;
    let mockedOriginalMiddleware: jest.Mock;
    let mockedSentryMiddleware: jest.Mock;

    beforeEach(() => {
      jest.clearAllMocks();
      originalEnhanceMiddleware = jest.fn();
      mockedOriginalMiddleware = jest.fn();
      mockedSentryMiddleware = jest.fn();
      jest.spyOn(metroMiddleware, 'createSentryMetroMiddleware').mockReturnValue(mockedSentryMiddleware);
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    it('should return sentry middleware directly if non set', () => {
      const testedConfig = withSentryMiddleware({});

      const testedMiddleware = testedConfig.server!.enhanceMiddleware({}, {} as any);

      expect(testedMiddleware).toBe(mockedSentryMiddleware);
    });

    it('should pass sentry middleware to the custom enhanceMiddleware', () => {
      const testedConfig = withSentryMiddleware({
        server: {
          enhanceMiddleware: originalEnhanceMiddleware.mockReturnValue(mockedOriginalMiddleware),
        },
      });

      const testedMiddleware = testedConfig.server!.enhanceMiddleware({}, {} as any);

      expect(testedMiddleware).toBe(mockedOriginalMiddleware);
      expect(originalEnhanceMiddleware).toHaveBeenCalledWith(mockedSentryMiddleware, {});
    });
  });

  describe('createSentryMetroMiddleware', () => {
    const defaultMiddleware = jest.fn();
    const next = jest.fn();
    const response = {} as any;

    let spiedCreateStackFramesContextMiddleware: jest.Spied<typeof createStackFramesContextMiddleware>;
    let mockedStackFramesContextMiddleware: jest.Mock;

    beforeEach(() => {
      jest.clearAllMocks();
      mockedStackFramesContextMiddleware = jest.fn();
      spiedCreateStackFramesContextMiddleware = jest
        .spyOn(metroMiddleware, 'createStackFramesContextMiddleware')
        .mockReturnValue(mockedStackFramesContextMiddleware);
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    it('should call stackFramesContextMiddleware for sentry context requests', () => {
      const testedMiddleware = createSentryMetroMiddleware(defaultMiddleware, [TEST_PROJECT_ROOT]);

      const sentryRequest = {
        url: '/__sentry/context',
      } as any;
      testedMiddleware(sentryRequest, response, next);
      expect(defaultMiddleware).not.toHaveBeenCalled();
      expect(spiedCreateStackFramesContextMiddleware).toHaveBeenCalledWith([TEST_PROJECT_ROOT]);
      expect(mockedStackFramesContextMiddleware).toHaveBeenCalledWith(sentryRequest, response, next);
    });

    it('should call openURLMiddleware for sentry open-url requests', () => {
      const spiedOpenURLMiddleware = jest
        .spyOn(openUrlMiddlewareModule, 'openURLMiddleware')
        .mockReturnValue(undefined as any);

      const testedMiddleware = createSentryMetroMiddleware(defaultMiddleware, [TEST_PROJECT_ROOT]);

      const openUrlRequest = {
        url: '/__sentry/open-url',
      } as any;
      testedMiddleware(openUrlRequest, response, next);
      expect(defaultMiddleware).not.toHaveBeenCalled();
      expect(mockedStackFramesContextMiddleware).not.toHaveBeenCalled();
      expect(spiedOpenURLMiddleware).toHaveBeenCalledWith(openUrlRequest, response);

      spiedOpenURLMiddleware.mockRestore();
    });

    it('should call default middleware for non-sentry requests', () => {
      const testedMiddleware = createSentryMetroMiddleware(defaultMiddleware, [TEST_PROJECT_ROOT]);

      const regularRequest = {
        url: '/regular/path',
      } as any;
      testedMiddleware(regularRequest, response, next);
      expect(defaultMiddleware).toHaveBeenCalledWith(regularRequest, response, next);
      expect(defaultMiddleware).toHaveBeenCalledTimes(1);
      expect(mockedStackFramesContextMiddleware).not.toHaveBeenCalled();
    });
  });

  describe('stackFramesContextMiddleware', () => {
    let request: any;
    let response: any;
    const next = jest.fn();
    const stackFramesContextMiddleware = createStackFramesContextMiddleware([TEST_PROJECT_ROOT]);

    let testData: string = '';

    beforeEach(() => {
      // afterEach resetAllMocks wipes the default fs impls installed via jest.mock, so reinstate.
      (fs.realpath as unknown as jest.Mock).mockImplementation(
        (p: string, cb: (err: NodeJS.ErrnoException | null, resolved: string) => void) => cb(null, p),
      );
      (fs.realpathSync as unknown as jest.Mock).mockImplementation((p: string) => p);

      request = {
        setEncoding: jest.fn(),
        on: jest.fn((event: string, cb: (data?: string) => void) => {
          if (event === 'end') {
            cb();
          } else if (event === 'data') {
            cb(testData);
          }
        }),
      } as any;

      response = {
        statusCode: 0,
        setHeader: jest.fn(),
        end: jest.fn(),
      } as any;
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    it('should set request encoding to utf8', async () => {
      await stackFramesContextMiddleware(request, response, next);

      expect(request.setEncoding).toHaveBeenCalledWith('utf8');
    });

    it('should return 400 for missing request body', async () => {
      await stackFramesContextMiddleware(request, response, next);

      expect(response.statusCode).toBe(400);
      expect(response.end).toHaveBeenCalledWith('Invalid request body. Expected a JSON object.');
    });

    it('should return 400 for invalid request body', async () => {
      testData = 'invalid';
      await stackFramesContextMiddleware(request, response, next);

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when stack is not an array', async () => {
      testData = '{"stack": "not an array"}';
      await stackFramesContextMiddleware(request, response, next);

      expect(response.statusCode).toBe(400);
      expect(response.end).toHaveBeenCalledWith('Invalid stack frames. Expected an array.');
    });

    it('should set content type to application/json for valid response', async () => {
      testData = '{"stack":[]}';
      await stackFramesContextMiddleware(request, response, next);

      expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
    });

    it('should return 200 for valid empty stack', async () => {
      testData = '{"stack":[]}';
      await stackFramesContextMiddleware(request, response, next);

      expect(response.statusCode).toBe(200);
    });

    it('should add source context for in_app frames', async () => {
      const readFileSpy = jest.spyOn(fs, 'readFile');
      testData = JSON.stringify({
        stack: [
          {
            in_app: true,
            filename: 'test.js',
            function: 'testFunction',
            lineno: 3,
            colno: 1,
          },
        ],
      } satisfies { stack: StackFrame[] });

      mockReadFileOnce(readFileSpy, path.join(TEST_PROJECT_ROOT, 'test.js'), 'line1\nline2\nline3\nline4\nline5');

      await stackFramesContextMiddleware(request, response, next);

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.end.mock.calls[0][0])).toEqual({
        stack: [
          {
            in_app: true,
            filename: 'test.js',
            function: 'testFunction',
            lineno: 3,
            colno: 1,
            pre_context: ['line1', 'line2'],
            context_line: 'line3',
            post_context: ['line4', 'line5'],
          },
        ],
      });
    });

    it('should skip source context for in_app frames without filename', async () => {
      const readFileSpy = jest.spyOn(fs, 'readFile');
      testData = JSON.stringify({
        stack: [
          {
            in_app: true,
            function: 'testFunction',
            lineno: 3,
            colno: 1,
          },
        ],
      } satisfies { stack: StackFrame[] });

      await stackFramesContextMiddleware(request, response, next);

      expect(readFileSpy).not.toHaveBeenCalled();
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.end.mock.calls[0][0])).toEqual({
        stack: [
          {
            in_app: true,
            function: 'testFunction',
            lineno: 3,
            colno: 1,
          },
        ],
      });
    });

    it('should skip source context for non in_app frames', async () => {
      const readFileSpy = jest.spyOn(fs, 'readFile');
      testData = JSON.stringify({
        stack: [
          {
            in_app: false,
            filename: 'test.js',
            function: 'testFunction',
            lineno: 3,
            colno: 1,
          },
        ],
      } satisfies { stack: StackFrame[] });

      await stackFramesContextMiddleware(request, response, next);

      expect(readFileSpy).not.toHaveBeenCalled();
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.end.mock.calls[0][0])).toEqual({
        stack: [
          {
            in_app: false,
            filename: 'test.js',
            function: 'testFunction',
            lineno: 3,
            colno: 1,
          },
        ],
      });
    });

    it('should add source context for frames under additional allowed roots (watchFolders)', async () => {
      const watchFolder = path.resolve('/tmp/sentry-rn-test-workspace-pkg');
      const scopedMiddleware = createStackFramesContextMiddleware([TEST_PROJECT_ROOT, watchFolder]);
      const readFileSpy = jest.spyOn(fs, 'readFile');
      mockReadFileOnce(readFileSpy, path.join(watchFolder, 'shared.js'), 'one\ntwo\nthree\nfour\nfive');

      testData = JSON.stringify({
        stack: [
          {
            in_app: true,
            filename: path.join(watchFolder, 'shared.js'),
            function: 'sharedFn',
            lineno: 3,
            colno: 1,
          },
        ],
      } satisfies { stack: StackFrame[] });

      await scopedMiddleware(request, response, next);

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.end.mock.calls[0][0])).toEqual({
        stack: [
          {
            in_app: true,
            filename: path.join(watchFolder, 'shared.js'),
            function: 'sharedFn',
            lineno: 3,
            colno: 1,
            pre_context: ['one', 'two'],
            context_line: 'three',
            post_context: ['four', 'five'],
          },
        ],
      });
    });

    it('should skip frames whose filename escapes the project root', async () => {
      const readFileSpy = jest.spyOn(fs, 'readFile');
      testData = JSON.stringify({
        stack: [
          {
            in_app: true,
            filename: '/etc/passwd',
            function: 'testFunction',
            lineno: 1,
            colno: 1,
          },
          {
            in_app: true,
            filename: '../outside.js',
            function: 'testFunction',
            lineno: 1,
            colno: 1,
          },
        ],
      } satisfies { stack: StackFrame[] });

      await stackFramesContextMiddleware(request, response, next);

      expect(readFileSpy).not.toHaveBeenCalled();
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.end.mock.calls[0][0])).toEqual({
        stack: [
          {
            in_app: true,
            filename: '/etc/passwd',
            function: 'testFunction',
            lineno: 1,
            colno: 1,
          },
          {
            in_app: true,
            filename: '../outside.js',
            function: 'testFunction',
            lineno: 1,
            colno: 1,
          },
        ],
      });
    });

    it('should skip frames whose realpath resolves outside the allowed roots', async () => {
      const realpathSpy = jest.spyOn(fs, 'realpath') as unknown as jest.Mock;
      const readFileSpy = jest.spyOn(fs, 'readFile');

      // Simulate a symlink: the file lives at <project>/link/file.js inside the project,
      // but its realpath is /etc/shadow — outside every allowed root.
      realpathSpy.mockImplementationOnce(
        (_p: string, cb: (err: NodeJS.ErrnoException | null, resolved: string) => void) => cb(null, '/etc/shadow'),
      );

      testData = JSON.stringify({
        stack: [
          {
            in_app: true,
            filename: 'link/file.js',
            function: 'testFunction',
            lineno: 1,
            colno: 1,
          },
        ],
      } satisfies { stack: StackFrame[] });

      await stackFramesContextMiddleware(request, response, next);

      expect(readFileSpy).not.toHaveBeenCalled();
      expect(response.statusCode).toBe(200);
    });

    it('should skip frames whose realpath cannot be resolved', async () => {
      const realpathSpy = jest.spyOn(fs, 'realpath') as unknown as jest.Mock;
      const readFileSpy = jest.spyOn(fs, 'readFile');

      const enoent: NodeJS.ErrnoException = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      realpathSpy.mockImplementationOnce(
        (_p: string, cb: (err: NodeJS.ErrnoException | null, resolved: string) => void) => cb(enoent, ''),
      );

      testData = JSON.stringify({
        stack: [
          {
            in_app: true,
            filename: 'missing.js',
            function: 'testFunction',
            lineno: 1,
            colno: 1,
          },
        ],
      } satisfies { stack: StackFrame[] });

      await stackFramesContextMiddleware(request, response, next);

      expect(readFileSpy).not.toHaveBeenCalled();
      expect(response.statusCode).toBe(200);
    });

    it('should handle mixed frame types correctly', async () => {
      const readFileSpy = jest.spyOn(fs, 'readFile');
      mockReadFileOnce(readFileSpy, path.join(TEST_PROJECT_ROOT, 'app1.js'), 'line1\nline2\nline3\nline4\nline5');
      mockReadFileOnce(readFileSpy, path.join(TEST_PROJECT_ROOT, 'app2.js'), 'code1\ncode2\ncode3\ncode4\ncode5');

      testData = JSON.stringify({
        stack: [
          {
            in_app: true,
            filename: 'app1.js',
            function: 'inAppFunction1',
            lineno: 3,
            colno: 1,
          },
          {
            in_app: false,
            filename: 'vendor.js',
            function: 'vendorFunction',
            lineno: 42,
            colno: 10,
          },
          {
            in_app: true,
            filename: 'app2.js',
            function: 'inAppFunction2',
            lineno: 2,
            colno: 5,
          },
          {
            filename: '[native code]',
            function: 'nativeFunction',
          },
        ],
      } satisfies { stack: StackFrame[] });

      await stackFramesContextMiddleware(request, response, next);

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.end.mock.calls[0][0])).toEqual({
        stack: [
          {
            in_app: true,
            filename: 'app1.js',
            function: 'inAppFunction1',
            lineno: 3,
            colno: 1,
            pre_context: ['line1', 'line2'],
            context_line: 'line3',
            post_context: ['line4', 'line5'],
          },
          {
            in_app: false,
            filename: 'vendor.js',
            function: 'vendorFunction',
            lineno: 42,
            colno: 10,
          },
          {
            in_app: true,
            filename: 'app2.js',
            function: 'inAppFunction2',
            lineno: 2,
            colno: 5,
            pre_context: ['code1'],
            context_line: 'code2',
            post_context: ['code3', 'code4', 'code5'],
          },
          {
            filename: '[native code]',
            function: 'nativeFunction',
          },
        ],
      });
    });
  });
});

function mockReadFileOnce(spy: jest.SpiedFunction<typeof fs.readFile>, path: string, content: string) {
  spy.mockImplementationOnce((filename, _options, callback) => {
    if (filename === path) {
      callback(null, content);
    } else {
      callback(new Error('File not found'), null);
    }
  });
}
