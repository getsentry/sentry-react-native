import { RN_GLOBAL_OBJ } from './worldwide';

/**
 * The DONE ready state for XmlHttpRequest
 *
 * Defining it here as a constant b/c XMLHttpRequest.DONE is not always defined
 * (e.g. during testing, it is `undefined`)
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/readyState}
 */
export const XHR_READYSTATE_DONE = 4;

let originalXhrOpen: XMLHttpRequest['open'] | null = null;
let originalXhrSend: XMLHttpRequest['send'] | null = null;

/**
 * Saves original XHR methods so that they can be used later
*/
export function preserveXMLHttpRequest(): void {
  if (!RN_GLOBAL_OBJ.XMLHttpRequest || !RN_GLOBAL_OBJ.XMLHttpRequest.prototype) {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/unbound-method
  originalXhrOpen = RN_GLOBAL_OBJ.XMLHttpRequest.prototype.open;
  // eslint-disable-next-line @typescript-eslint/unbound-method
  originalXhrSend = RN_GLOBAL_OBJ.XMLHttpRequest.prototype.send;
}

/**
 * Creates a new XMLHttpRequest object which is not instrumented by the SDK.
 *
 * This request won't be captured by the HttpClient Errors integration
 * and won't be added to breadcrumbs and won't be traced.
 */
export function createStealthXhr(): XMLHttpRequest {
  const xhr = new XMLHttpRequest();
  if (originalXhrOpen) {
    xhr.open = originalXhrOpen.bind(xhr);
  }
  if (originalXhrSend) {
    xhr.send = originalXhrSend.bind(xhr);
  }
  return xhr;
};
