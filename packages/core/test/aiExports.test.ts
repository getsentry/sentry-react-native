import * as Sentry from '../src/js';

describe('AI SDK manual instrumentation re-exports', () => {
  test.each([
    'instrumentOpenAiClient',
    'instrumentAnthropicAiClient',
    'instrumentGoogleGenAIClient',
    'createLangChainCallbackHandler',
    'instrumentLangGraph',
    'instrumentStateGraphCompile',
  ])('re-exports %s from @sentry/core', name => {
    expect(typeof (Sentry as Record<string, unknown>)[name]).toBe('function');
  });
});
