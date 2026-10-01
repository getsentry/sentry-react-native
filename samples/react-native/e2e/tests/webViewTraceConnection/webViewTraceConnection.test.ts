import { describe, it, expect } from '@jest/globals';

import { maestro } from '../../utils/maestro';

describe('WebView trace connection', () => {
  it('injects the React Native trace into the WebView, which reads it back', async () => {
    // The check runs on-device in the Maestro flow: it opens the WebView demo
    // screen and asserts the "WebView trace connected" status becomes visible,
    // which only happens when the page reads back the injected `sentry-trace`
    // meta tag and it matches the trace active in React Native. A failed
    // injection makes the flow exit non-zero, rejecting this promise.
    await expect(
      maestro('tests/webViewTraceConnection/webViewTraceConnection.test.yml'),
    ).resolves.toBeUndefined();
  }, 240000);
});
