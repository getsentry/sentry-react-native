import { createStealthXhr } from '../../src/js/utils/xhr';

describe('xhr', () => {
  it('creates xhr and calls monkey patched methods if original was not preserved', () => {
    const XMLHttpRequestMock = getXhrMock();
    const globalMock = createGlobalMock(XMLHttpRequestMock);

    const xhr = createStealthXhr(globalMock);

    xhr!.open('GET', 'https://example.com');
    xhr!.send();

    expect(xhr!.open).toHaveBeenCalledWith('GET', 'https://example.com');
    expect(xhr!.send).toHaveBeenCalled();
  });

  it('monkey patched xhr is not called when original is preserved', () => {
    const XMLHttpRequestMock = getXhrMock();
    const globalMock = createGlobalMock(XMLHttpRequestMock);

    const { xhrOpenMonkeyPatch, xhrSendMonkeyPatch } = mockSentryPatchWithOriginal(globalMock);

    const xhr = createStealthXhr(globalMock);

    xhr!.open('GET', 'https://example.com');
    xhr!.send();

    expect(xhrOpenMonkeyPatch).not.toHaveBeenCalled();
    expect(xhrSendMonkeyPatch).not.toHaveBeenCalled();
    expect(xhr!.open).toHaveBeenCalledWith('GET', 'https://example.com');
    expect(xhr!.send).toHaveBeenCalled();
  });
});

function createGlobalMock(xhr: unknown) {
  return {
    XMLHttpRequest: xhr as typeof XMLHttpRequest,
  };
}

function getXhrMock() {
  function XhrMock() {}

  XhrMock.prototype.open = jest.fn();
  XhrMock.prototype.send = jest.fn();

  return XhrMock;
}

type WithSentryOriginal<T> = T & { __sentry_original__?: T };

function mockSentryPatchWithOriginal(globalMock: { XMLHttpRequest: typeof XMLHttpRequest }): {
  xhrOpenMonkeyPatch: jest.Mock;
  xhrSendMonkeyPatch: jest.Mock;
} {
  const originalOpen = globalMock.XMLHttpRequest.prototype.open;
  const originalSend = globalMock.XMLHttpRequest.prototype.send;

  const xhrOpenMonkeyPatch = jest.fn();
  const xhrSendMonkeyPatch = jest.fn();

  globalMock.XMLHttpRequest.prototype.open = xhrOpenMonkeyPatch;
  globalMock.XMLHttpRequest.prototype.send = xhrSendMonkeyPatch;

  (
    globalMock.XMLHttpRequest.prototype.open as WithSentryOriginal<typeof XMLHttpRequest.prototype.open>
  ).__sentry_original__ = originalOpen;
  (
    globalMock.XMLHttpRequest.prototype.send as WithSentryOriginal<typeof XMLHttpRequest.prototype.send>
  ).__sentry_original__ = originalSend;

  return {
    xhrOpenMonkeyPatch,
    xhrSendMonkeyPatch,
  };
}
