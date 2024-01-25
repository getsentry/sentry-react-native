import { createStealthXhr, preserveXMLHttpRequest } from '../../src/js/utils/xhr';

describe('xhr', () => {
  it('creates xhr and calls monkey patched methods if original was not preserved', () => {
    const XMLHttpRequestMock = getXhrMock();
    const globalMock = createGlobalMock(XMLHttpRequestMock);

    const xhr = createStealthXhr(globalMock);

    xhr.open('GET', 'https://example.com');
    xhr.send();

    expect(xhr.open).toHaveBeenCalledWith('GET', 'https://example.com');
    expect(xhr.send).toHaveBeenCalled();
  });

  it('monkey patched xhr is not called when original is preserved', () => {
    const xhrOpenMonkeyPatch = jest.fn();
    const xhrSendMonkeyPatch = jest.fn();

    const XMLHttpRequestMock = getXhrMock();
    const globalMock = createGlobalMock(XMLHttpRequestMock);

    preserveXMLHttpRequest(globalMock);

    XMLHttpRequestMock.prototype.open = xhrOpenMonkeyPatch;
    XMLHttpRequestMock.prototype.send = xhrSendMonkeyPatch;

    const xhr = createStealthXhr(globalMock);

    xhr.open('GET', 'https://example.com');
    xhr.send();

    expect(xhrOpenMonkeyPatch).not.toHaveBeenCalled();
    expect(xhrSendMonkeyPatch).not.toHaveBeenCalled();
    expect(xhr.open).toHaveBeenCalledWith('GET', 'https://example.com');
    expect(xhr.send).toHaveBeenCalled();
  });
});

function createGlobalMock(xhr: unknown) {
  return {
    XMLHttpRequest: xhr as typeof XMLHttpRequest,
  };
}

function getXhrMock() {
  return class XhrMock {
    open = jest.fn();
    send = jest.fn();
  };
}
