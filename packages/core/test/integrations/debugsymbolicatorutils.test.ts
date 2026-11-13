import type * as ReactNative from '../../src/js/vendor/react-native';

import { parseErrorStack, symbolicateStackTrace } from '../../src/js/integrations/debugsymbolicatorutils';
import { ReactNativeLibraries } from '../../src/js/utils/rnlibraries';
import { RN_GLOBAL_OBJ } from '../../src/js/utils/worldwide';
import { XHR_READYSTATE_DONE } from '../../src/js/utils/xhr';

describe('parseErrorStack', () => {
  it('should parse Chrome-style stack trace', () => {
    const stack = `Error: Test error
  at foo (http://localhost:8081/index.bundle:10:15)
  at bar (http://localhost:8081/index.bundle:20:25)`;

    const frames = parseErrorStack(stack);

    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({
      methodName: 'foo',
      file: 'http://localhost:8081/index.bundle',
      lineNumber: 10,
    });
    expect(frames[0].column).toBeDefined();
    expect(frames[1]).toMatchObject({
      methodName: 'bar',
      file: 'http://localhost:8081/index.bundle',
      lineNumber: 20,
    });
    expect(frames[1].column).toBeDefined();
  });

  it('should handle anonymous functions', () => {
    const stack = `Error: Test error
  at <anonymous> (http://localhost:8081/index.bundle:10:15)`;

    const frames = parseErrorStack(stack);

    expect(frames.length).toBeGreaterThanOrEqual(1);
    expect(frames[0].methodName).toBeDefined();
    expect(frames[0].lineNumber).toBe(10);
  });

  it('should handle empty stack', () => {
    const frames = parseErrorStack('');

    expect(frames).toEqual([]);
  });

  it('should handle malformed stack gracefully', () => {
    const frames = parseErrorStack('Not a valid stack trace');

    expect(Array.isArray(frames)).toBe(true);
  });

  it('should preserve Metro bundle URLs with query params', () => {
    const stack = `Error: Test error
  at App (http://localhost:8081/index.bundle?platform=ios&dev=true:1:1)`;

    const frames = parseErrorStack(stack);

    expect(frames[0].file).toContain('platform=ios');
    expect(frames[0].methodName).toBe('App');
  });

  it('should handle frames without line/column info', () => {
    const stack = `Error: Test error
  at native`;

    const frames = parseErrorStack(stack);

    // Should not crash, may return empty or partial frames
    expect(Array.isArray(frames)).toBe(true);
  });
});

describe('symbolicateStackTrace', () => {
  const stack: Array<ReactNative.StackFrame> = [
    { methodName: 'foo', file: 'http://localhost:8081/index.bundle', lineNumber: 1, column: 1 },
  ];
  const symbolicated: ReactNative.SymbolicatedStackTrace = {
    stack: [{ methodName: 'foo', file: '/app/src/foo.ts', lineNumber: 10, column: 5 }],
  };

  let originalDevtools: typeof ReactNativeLibraries.Devtools;
  let originalXMLHttpRequest: typeof XMLHttpRequest | undefined;
  let mockXhr: MockXhr;

  beforeEach(() => {
    originalDevtools = ReactNativeLibraries.Devtools;
    originalXMLHttpRequest = RN_GLOBAL_OBJ.XMLHttpRequest;

    mockXhr = createMockXhr();
    RN_GLOBAL_OBJ.XMLHttpRequest = jest.fn(() => mockXhr) as unknown as typeof XMLHttpRequest;
  });

  afterEach(() => {
    ReactNativeLibraries.Devtools = originalDevtools;
    RN_GLOBAL_OBJ.XMLHttpRequest = originalXMLHttpRequest;
  });

  it('uses RN Devtools symbolicateStackTrace when available', async () => {
    const devtoolsSymbolicate = jest.fn(() => Promise.resolve(symbolicated));
    ReactNativeLibraries.Devtools = mockDevtools({ symbolicateStackTrace: devtoolsSymbolicate });

    const result = await symbolicateStackTrace(stack, { extra: 'data' });

    expect(result).toEqual(symbolicated);
    expect(devtoolsSymbolicate).toHaveBeenCalledWith(stack, { extra: 'data' });
    expect(mockXhr.open).not.toHaveBeenCalled();
  });

  it('falls back to the Sentry middleware when RN Devtools symbolicateStackTrace throws', async () => {
    ReactNativeLibraries.Devtools = mockDevtools({
      symbolicateStackTrace: jest.fn(() => {
        throw new Error("Cannot find module 'react-native/Libraries/Core/Devtools/symbolicateStackTrace'");
      }),
    });

    const result = symbolicateStackTrace(stack, { extra: 'data' });
    mockXhr.respond(200, JSON.stringify(symbolicated));

    await expect(result).resolves.toEqual(symbolicated);
    expect(mockXhr.open).toHaveBeenCalledWith('POST', 'http://localhost:8081/__sentry/symbolicate', true);
    expect(mockXhr.send).toHaveBeenCalledWith(JSON.stringify({ stack, extraData: { extra: 'data' } }));
  });

  it('falls back to the Sentry middleware when RN Devtools symbolicateStackTrace rejects', async () => {
    ReactNativeLibraries.Devtools = mockDevtools({
      symbolicateStackTrace: jest.fn(() => Promise.reject(new Error('Network error'))),
    });

    const result = symbolicateStackTrace(stack);
    await flushPromises();
    mockXhr.respond(200, JSON.stringify(symbolicated));

    await expect(result).resolves.toEqual(symbolicated);
    expect(mockXhr.open).toHaveBeenCalledWith('POST', 'http://localhost:8081/__sentry/symbolicate', true);
  });

  it('rejects when the Sentry middleware responds with non 200 status', async () => {
    ReactNativeLibraries.Devtools = mockDevtools({ symbolicateStackTrace: undefined });

    const result = symbolicateStackTrace(stack);
    mockXhr.respond(404, 'Not Found');

    await expect(result).rejects.toThrow('Symbolication request failed with status 404.');
  });

  it('rejects when the Sentry middleware responds with invalid JSON', async () => {
    ReactNativeLibraries.Devtools = mockDevtools({ symbolicateStackTrace: undefined });

    const result = symbolicateStackTrace(stack);
    mockXhr.respond(200, 'not json');

    await expect(result).rejects.toThrow('Could not parse symbolication response.');
  });

  it('rejects when the Sentry middleware request errors', async () => {
    ReactNativeLibraries.Devtools = mockDevtools({ symbolicateStackTrace: undefined });

    const result = symbolicateStackTrace(stack);
    (mockXhr.onerror as unknown as () => void)();

    await expect(result).rejects.toThrow('Symbolication request failed.');
  });

  it('rejects when the bundle was not loaded from Metro', async () => {
    ReactNativeLibraries.Devtools = mockDevtools({
      symbolicateStackTrace: undefined,
      bundleLoadedFromServer: false,
    });

    await expect(symbolicateStackTrace(stack)).rejects.toThrow('Bundle was not loaded from Metro.');
    expect(mockXhr.open).not.toHaveBeenCalled();
  });

  it('rejects when RN Devtools are not available', async () => {
    ReactNativeLibraries.Devtools = undefined;

    await expect(symbolicateStackTrace(stack)).rejects.toThrow('Bundle was not loaded from Metro.');
    expect(mockXhr.open).not.toHaveBeenCalled();
  });
});

type MockXhr = XMLHttpRequest & { respond: (status: number, responseText: string) => void };

function createMockXhr(): MockXhr {
  const xhr = {
    readyState: 0,
    status: 0,
    responseText: '',
    open: jest.fn(),
    send: jest.fn(),
    setRequestHeader: jest.fn(),
    onreadystatechange: null,
    onerror: null,
    respond(status: number, responseText: string): void {
      xhr.readyState = XHR_READYSTATE_DONE;
      xhr.status = status;
      xhr.responseText = responseText;
      (xhr.onreadystatechange as unknown as () => void)?.();
    },
  };
  return xhr as unknown as MockXhr;
}

function mockDevtools({
  symbolicateStackTrace,
  bundleLoadedFromServer = true,
}: {
  symbolicateStackTrace: jest.Mock | undefined;
  bundleLoadedFromServer?: boolean;
}): typeof ReactNativeLibraries.Devtools {
  return {
    symbolicateStackTrace,
    getDevServer: () => ({ url: 'http://localhost:8081/', bundleLoadedFromServer }),
  } as typeof ReactNativeLibraries.Devtools;
}

function flushPromises(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}
