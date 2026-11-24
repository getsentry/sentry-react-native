import { describe, it } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { maestro } from '../../utils/maestro';

/**
 * Prints the texts on screen, including the WebView page's own text, so a failure
 * shows how far the trace got: "(none — not injected)" means the page never saw the
 * injected meta tag, "(reading…)" means the page script never ran, and a trace value
 * in the page means the readback was not delivered to or not matched in React Native.
 */
function printScreenTexts(): void {
  try {
    const hierarchy = execFileSync('maestro', ['hierarchy'], {
      cwd: path.join(__dirname, '../..'),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: 120000,
    });
    // In screen order: the React Native panel first, then the WebView page.
    const texts = [...hierarchy.matchAll(/"(?:text|accessibilityText|hintText)"\s*:\s*"([^"]+)"/g)].map(
      match => match[1],
    );
    console.log('Screen texts after the WebView flow failed:\n' + texts.join('\n'));
  } catch (e) {
    console.log('Could not read the screen hierarchy:', e);
  }
}

describe('WebView trace connection', () => {
  it('injects the React Native trace into the WebView, which reads it back', async () => {
    // The check runs on-device in the Maestro flow: it opens the WebView demo
    // screen and asserts the "WebView trace connected" status becomes visible,
    // which only happens when the page reads back the injected `sentry-trace`
    // meta tag and it matches the trace active in React Native. A failed
    // injection makes the flow exit non-zero, rejecting this promise.
    try {
      await maestro('tests/webViewTraceConnection/webViewTraceConnection.test.yml');
    } catch (error) {
      printScreenTexts();
      throw error;
    }
  }, 240000);
});
