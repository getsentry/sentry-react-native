import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { StackFrame } from '@sentry/core';
import * as fs from 'fs';

import * as metroMiddleware from '../../src/js/tools/metroMiddleware';

const { withSentryMiddleware, createSentryMetroMiddleware, stackFramesContextMiddleware } = metroMiddleware;

jest.mock('../../src/js/tools/metroMiddleware', () => jest.requireActual('../../src/js/tools/metroMiddleware'));
jest.mock('fs', () => {
  return {
    readFile: jest.fn(),
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

    let spiedStackFramesContextMiddleware: jest.Spied<typeof stackFramesContextMiddleware>;

    beforeEach(() => {
      jest.clearAllMocks();
      spiedStackFramesContextMiddleware = jest
        .spyOn(metroMiddleware, 'stackFramesContextMiddleware')
        .mockReturnValue(undefined);
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    it('should call stackFramesContextMiddleware for sentry context requests', () => {
      const testedMiddleware = createSentryMetroMiddleware(defaultMiddleware);

      const sentryRequest = {
        url: '/__sentry/context',
      } as any;
      testedMiddleware(sentryRequest, response, next);
      expect(defaultMiddleware).not.toHaveBeenCalled();
      expect(spiedStackFramesContextMiddleware).toHaveBeenCalledWith(sentryRequest, response);
    });

    it('should call default middleware for non-sentry requests', () => {
      const testedMiddleware = createSentryMetroMiddleware(defaultMiddleware);

      const regularRequest = {
        url: '/regular/path',
      } as any;
      testedMiddleware(regularRequest, response, next);
      expect(defaultMiddleware).toHaveBeenCalledWith(regularRequest, response, next);
      expect(defaultMiddleware).toHaveBeenCalledTimes(1);
      expect(spiedStackFramesContextMiddleware).not.toHaveBeenCalled();
    });
  });

  describe('stackFramesContextMiddleware', () => {
    let request: any;
    let response: any;

    let testData: string = '';

    beforeEach(() => {
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
      await stackFramesContextMiddleware(request, response);

      expect(request.setEncoding).toHaveBeenCalledWith('utf8');
    });

    it('should return 400 for missing request body', async () => {
      await stackFramesContextMiddleware(request, response);

      expect(response.statusCode).toBe(400);
      expect(response.end).toHaveBeenCalledWith('Invalid request body. Expected a JSON object.');
    });

    it('should return 400 for invalid request body', async () => {
      testData = 'invalid';
      await stackFramesContextMiddleware(request, response);

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when stack is not an array', async () => {
      testData = '{"stack": "not an array"}';
      await stackFramesContextMiddleware(request, response);

      expect(response.statusCode).toBe(400);
      expect(response.end).toHaveBeenCalledWith('Invalid stack frames. Expected an array.');
    });

    it('should set content type to application/json for valid response', async () => {
      testData = '{"stack":[]}';
      await stackFramesContextMiddleware(request, response);

      expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
    });

    it('should return 200 for valid empty stack', async () => {
      testData = '{"stack":[]}';
      await stackFramesContextMiddleware(request, response);

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

      mockReadFileOnce(readFileSpy, 'test.js', 'line1\nline2\nline3\nline4\nline5');

      await stackFramesContextMiddleware(request, response);

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

      await stackFramesContextMiddleware(request, response);

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

      await stackFramesContextMiddleware(request, response);

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

    it('should handle mixed frame types correctly', async () => {
      const readFileSpy = jest.spyOn(fs, 'readFile');
      mockReadFileOnce(readFileSpy, 'app1.js', 'line1\nline2\nline3\nline4\nline5');
      mockReadFileOnce(readFileSpy, 'app2.js', 'code1\ncode2\ncode3\ncode4\ncode5');

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

      await stackFramesContextMiddleware(request, response);

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
