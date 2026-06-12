const mockDebugWarn = jest.fn();
const mockCarrier: Record<string, unknown> = {};

jest.mock('@sentry/core', () => ({
  debug: {
    get warn() {
      return mockDebugWarn;
    },
  },
  getMainCarrier: () => mockCarrier,
  SDK_VERSION: '10.0.0',
}));

import { checkSentryJsSdkVersionMismatch } from '../../src/js/utils/sdkVersionCheck';

describe('checkSentryJsSdkVersionMismatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete mockCarrier.__SENTRY__;
  });

  it('does not warn when only one SDK version is present', () => {
    mockCarrier.__SENTRY__ = { '10.0.0': {} };

    checkSentryJsSdkVersionMismatch();

    expect(mockDebugWarn).not.toHaveBeenCalled();
  });

  it('warns when multiple SDK versions are present', () => {
    mockCarrier.__SENTRY__ = { '10.0.0': {}, '9.0.0': {} };

    checkSentryJsSdkVersionMismatch();

    expect(mockDebugWarn).toHaveBeenCalledTimes(1);
    expect(mockDebugWarn).toHaveBeenCalledWith(expect.stringContaining('Multiple versions of Sentry JavaScript SDKs'));
    expect(mockDebugWarn).toHaveBeenCalledWith(expect.stringContaining('9.0.0'));
    expect(mockDebugWarn).toHaveBeenCalledWith(expect.stringContaining('10.0.0'));
  });

  it('warns when more than two SDK versions are present', () => {
    mockCarrier.__SENTRY__ = { '10.0.0': {}, '9.0.0': {}, '8.0.0': {} };

    checkSentryJsSdkVersionMismatch();

    expect(mockDebugWarn).toHaveBeenCalledTimes(1);
    expect(mockDebugWarn).toHaveBeenCalledWith(expect.stringContaining('9.0.0'));
    expect(mockDebugWarn).toHaveBeenCalledWith(expect.stringContaining('8.0.0'));
  });

  it('does not warn when carrier has the version key set by @sentry/core', () => {
    mockCarrier.__SENTRY__ = { '10.0.0': {}, version: '10.0.0' };

    checkSentryJsSdkVersionMismatch();

    expect(mockDebugWarn).not.toHaveBeenCalled();
  });

  it('does not warn when __SENTRY__ is not set', () => {
    checkSentryJsSdkVersionMismatch();

    expect(mockDebugWarn).not.toHaveBeenCalled();
  });

  it('does not throw on unexpected errors', () => {
    Object.defineProperty(mockCarrier, '__SENTRY__', {
      get() {
        throw new Error('test error');
      },
      configurable: true,
    });

    expect(() => checkSentryJsSdkVersionMismatch()).not.toThrow();
    expect(mockDebugWarn).not.toHaveBeenCalled();

    delete mockCarrier.__SENTRY__;
  });
});
