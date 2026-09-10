---
name: test-guidelines
description: Enforce Sentry React Native SDK test conventions for naming, structure, mocking, and fixtures with Jest. Use when writing tests, adding tests, modifying tests, reviewing test code, fixing failing tests, adding coverage, TDD, test-first / red-green, reproducing bugs with tests, regression tests, or test refactoring in `packages/core`.
---

Apply these conventions to all new and modified tests in `packages/core`. Existing tests may not follow them — do not refactor them unless asked. Tests run on **Jest** (`yarn test`, `yarn test:watch`, `yarn test:sdk`, `yarn test:tools`).

Tests are easiest to write against code designed to accept its dependencies — when implementing the code under test, load **design-first** (where the seams go) and **code-guidelines** (the rules).

## Test-first loop

Work in **vertical slices**. One failing test → the minimal code that makes it pass → repeat. Each test proves one thin path end-to-end, and what it teaches shapes the next.

Do **not** write all the tests first and then all the implementation. That horizontal slicing produces tests of *imagined* behavior — they assert the shape you guessed at and pass when the real behavior breaks. Write one test at a time, against behavior you can already reason about.

Fixing a bug? Reproduce it with a failing test first — see **diagnosing-bugs**.

## File structure

- **One test file per source file.** Mirror the path: `src/js/client.ts` → `test/client.test.ts`; `src/js/integrations/release.ts` → `test/integrations/release.test.ts`.
- React component tests use `.test.tsx` and `@testing-library/react-native`.
- A single top-level `describe` naming the unit under test, with nested `describe`/`it` inside it.

## Naming

Follow the convention in `packages/core/AGENTS.md`: `describe`/`it` blocks (preferred), with the `it` describing the expected behavior for a given input.

- The top-level `describe` names the unit under test — the exported name (`myFeatureIntegration`, `NATIVE`, the class).
- Nested `describe` groups a method or a scenario; `it` states the behavior being verified.
- Write `it` as a clear behavior description, e.g. `returns expected value when input is valid`.

```typescript
describe('nativeLinkedErrorsIntegration', () => {
  describe('when the native module is unavailable', () => {
    it('returns the event unchanged', () => { /* ... */ });
  });

  describe('processEvent', () => {
    it('appends linked errors up to the configured limit', () => { /* ... */ });
  });
});
```

## Style — Arrange / Act / Assert

Structure every test in three clear sections; a blank line between them is enough.

```typescript
it('returns expected value when input is valid', () => {
  // Arrange
  const input = 'test';

  // Act
  const result = functionName(input);

  // Assert
  expect(result).toBe('expected');
});
```

Use **specific matchers** — they produce better failure messages:

```typescript
expect(array).toHaveLength(3);          // not expect(array.length).toBe(3)
expect(obj).toMatchObject({ a: 1 });    // partial structural match
expect(fn).toThrow(Error);
await expect(promise).resolves.toBe('ok');
await expect(promise).rejects.toThrow();
```

Assert the **exact** symptom, not "didn't crash". A test that only checks a call didn't throw catches almost nothing.

## Mocking

- **Reset between tests.** Use `afterEach(() => { jest.clearAllMocks(); })` (or `resetAllMocks` when you also stub implementations). A leaked mock is the most common flaky-test cause here.
- **Mock the native module, not the whole SDK.** Prefer the shared helpers (`test/mockWrapper.ts`, `test/mocks/`) over re-mocking `react-native` ad hoc. When you must, mock the bridge surface only:

```typescript
jest.mock('react-native', () => ({
  NativeModules: { RNSentry: { fetchNativeSdkInfo: jest.fn(() => Promise.resolve({})) } },
  Platform: { OS: 'ios', select: (o: any) => o.ios ?? o.default },
}));
```

- **Test both architectures / platforms** when the code branches on them. Drive `Platform.OS`, `isTurboModuleEnabled()`, `isFabricEnabled()` from the test rather than assuming one.
- Prefer injecting a fake at a seam over `jest.mock` of a deep import — a test that mocks internals breaks on refactors even when behavior is unchanged (see **design-first**: the interface is the test surface).
- Don't mock the thing under test. Don't assert on private internals; assert on observable output (the event, the envelope, the resolved value).

## Async & timers

- Always `await` async assertions; return or await the promise so Jest sees failures.
- For timing-dependent code (flush timers, debounces, retries) use **fake timers** (`jest.useFakeTimers()` + `jest.advanceTimersByTime(...)`), not real `setTimeout` — real delays make tests slow *and* flaky. Restore with `jest.useRealTimers()` in `afterEach`.
- No real network or filesystem. Stub the transport / bridge.

## What to test

- The **behavior at the seam** a caller depends on — inputs → observable outputs.
- Edge cases the code guidelines call out: native module missing, `enableNative` false, PII gating on/off, serialization round-trips across the bridge, both architectures.
- Every bug fix carries a regression test that goes red before the fix and green after.
