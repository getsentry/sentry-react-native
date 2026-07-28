import * as Sentry from '../src/js';

describe('AI SDK manual instrumentation re-exports', () => {
  test.each([
    'instrumentOpenAiClient',
    'instrumentAnthropicAiClient',
    'instrumentGoogleGenAIClient',
    'createLangChainCallbackHandler',
    'instrumentStateGraph',
    'instrumentLangGraph',
    'instrumentStateGraphCompile',
  ])('re-exports %s from @sentry/core', name => {
    expect(typeof (Sentry as Record<string, unknown>)[name]).toBe('function');
  });

  test('deprecated instrumentLangGraph is an alias of instrumentStateGraph', () => {
    expect(Sentry.instrumentLangGraph).toBe(Sentry.instrumentStateGraph);
  });
});
