# AGENTS.md

Sentry React Native SDK — a **hybrid SDK**: a TypeScript/JS layer on top that wraps the native **sentry-cocoa** (iOS) and **sentry-android/java** SDKs through a JS↔native bridge. Monorepo using yarn workspaces; the SDK itself is the `packages/core` package.

## Stack

- **Published packages:** `@sentry/react-native` (`packages/core`, the SDK) + companion `@sentry/expo-upload-sourcemaps`; yarn 4 workspaces.
- **Wraps native SDKs:** sentry-cocoa (iOS) + sentry-android/java (Android) through the JS↔native bridge.
- **Hosts:** React Native on **both** the New (TurboModule/Fabric) and Old (bridge) Architecture, plus Expo and React.
- **Exact versions** (don't copy them here — they rot): JS deps and host peer ranges in [`packages/core/package.json`](packages/core/package.json); the bundled native SDK versions per release in [`SDK-VERSIONS.md`](SDK-VERSIONS.md) (regenerated each release by `craft-pre-release.sh`).

Changes to the wrapped native SDKs can ripple to them and to downstream hybrid SDKs (Flutter, .NET/MAUI, Unity) — see *Cross-Platform Dependencies*.

## Agent Responsibilities

- **Reach for a skill first.** For anything beyond a trivial edit, load the matching skill (see *Skills*) — it carries the deep, current guidance this file only indexes.
- **Continuous Learning:** when you discover a durable pattern, record it in the nearest nested `AGENTS.md` (or the relevant skill), not inline in a PR.
- **Context Management:** after compaction, re-read the `AGENTS.md` for the surface you're touching before continuing.

## Setup

```bash
yarn install
yarn build
```

## Quick Reference

| Task | Command |
|------|---------|
| Build all packages | `yarn build` |
| Build SDK (watch) | `cd packages/core && yarn build:sdk:watch` |
| Run all tests | `yarn test` |
| Run all linters | `yarn lint` |
| Auto-fix lint | `yarn fix` |
| Circular dep check | `yarn circularDepCheck` |
| API report generate | `yarn api-report` |
| API report check | `cd packages/core && yarn api-report:check` |
| TS/JS lint | `yarn lint:lerna` |
| Android lint | `yarn lint:android` |
| Kotlin lint | `yarn lint:kotlin` |
| ObjC/C++ lint | `yarn lint:clang` |
| Swift lint | `yarn lint:swift` |

## Boundaries

**✅ Always**
- Run `yarn lint`, `yarn test`, and `yarn circularDepCheck` before calling a change done; regenerate the API report (`yarn api-report`) when the public surface moved.
- Make a change work on **both** architectures (New + Old) and **both** platforms (iOS + Android) — a fix that only covers one is not done.
- Gate any user data placed in events/breadcrumbs/spans/logs on `options.sendDefaultPii`.
- Catch native errors at the bridge boundary and degrade — reject/log, never let them propagate.

**⚠️ Ask first**
- Adding or changing any dependency, `.vscode` extension, GitHub Action, or native dependency — verify provenance first (load `code-guidelines` → *Adding dependencies*).
- Changing the public API (`packages/core/src/js/index.ts` barrel, exported options) or a codegen/bridge spec (`NativeRNSentry.ts`, `*NativeComponent.ts`) — these are breaking and need a deprecation path.
- Changing CI workflows, release config, or anything under `scripts/`.

**🚫 Never**
- Crash the host app — a native exception that reaches the app is the highest-severity failure this SDK can cause.
- Break the public API or bridge ABI without a `@deprecated` migration path (an app can ship new JS against an older cached native binary).
- Hand-edit generated files: `packages/core/etc/sentry-react-native.api.md` (regenerate it) or New-Architecture codegen output — regenerate, never edit by hand.
- Add `CHANGELOG.md` noise for routine internal/CI/test/chore changes — the user-facing sections (`### Features`, `### Fixes`) are for user-visible changes. A genuinely notable internal change goes under the `### Internal` section instead, not among the user-facing entries.
- Commit secrets, tokens, or DSNs.

## Commit Conventions

Follow conventional commit format: `<type>(<scope>): <subject>`

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`

**Scopes:** `android`, `ios`, `core`, `tracing`, `replay`, `profiling`, `e2e`

**Examples:**
```
feat(replay): Add mobile replay masking support
fix(android): Fix crash on startup with Hermes
```

## Pull Requests

When asked to open a PR:
- **Ask** if it should be a **draft** PR (default: draft).
- Use the repo's PR template (`.github/pull_request_template.md`) for the body. Fill in the sections:
  - **Type of change** — check the applicable boxes (Bugfix, New feature, Enhancement, Refactoring).
  - **Description** — describe the changes in detail.
  - **Motivation and Context** — why the change is needed, link related issues.
  - **How did you test it?** — list tests added/run.
  - **Checklist** — check the applicable boxes.
  - **Next steps** — note any follow-up work, or leave empty.

## Pre-Commit Checklist

- [ ] Code compiles without errors (`yarn build`)
- [ ] All tests pass (`yarn test`)
- [ ] Linting passes (`yarn lint`)
- [ ] No circular dependencies (`yarn circularDepCheck`)
- [ ] API report up to date (`yarn api-report` after `yarn build:sdk`)
- [ ] Native code formatted correctly
- [ ] TypeScript types are correct
- [ ] Tests added/updated for changes

## CI Overview

Workflows in `.github/workflows/`:

| Workflow | Purpose |
|----------|---------|
| `buildandtest.yml` | TS compilation, Jest tests, linting, circular dep check, API report, TS 3.8 compat |
| `native-tests.yml` | iOS/Android native tests across RN versions |
| `e2e-v2.yml` | E2E tests with Maestro on Sauce Labs |
| `sample-application.yml` | Sample RN app builds (iOS, Android, old/new arch) |
| `sample-application-expo.yml` | Sample Expo app builds |

**Ready-to-merge gate**: Expensive tests (native, E2E, sample builds) only run when the PR has the `ready-to-merge` label. Basic tests run on every commit.

**Concurrency**: PR workflows cancel previous runs on new pushes. Main branch workflows never cancel.

## Cross-Platform Dependencies

Changes may impact downstream SDKs. Coordinate with other teams when modifying native bridge APIs.

- **Sentry Cocoa** → iOS native SDK
- **Sentry Java/Android** → Android native SDK
- **Flutter**, **.NET (MAUI)**, **Unity** → depend on native SDKs

## Documentation

- **JSDoc comments** for public APIs
- **Inline comments** for complex logic only
- Update `CHANGELOG.md` for user-visible changes

## Skills — load on demand

The deep, task-specific guidance lives in `.agents/skills/` (registered in `agents.toml`) and is loaded when you need it — this file is the always-on operating manual, the skills are the specialists. Reach for one **before** doing the matching work:

| Skill | Load it when |
|-------|--------------|
| `spec` | The *what* isn't pinned down yet — a fuzzy issue or idea to scope into acceptance criteria. Hands off to `design-first`. |
| `design-first` | Starting a feature/integration, changing the public barrel, crossing the bridge, or changing a codegen spec — shape modules and seams before coding. |
| `code-guidelines` | Implementing, refactoring, designing APIs, writing integrations, handling breaking changes, or adding dependencies. |
| `test-guidelines` | Writing, modifying, or reviewing Jest tests, fixtures, and mocks. |
| `review` | A three-axis (Standards / Spec / Correctness) pass on a branch or PR before opening or merging. |
| `diagnosing-bugs` | A hard bug, flaky test, CI hang, native crash, or perf regression — builds a red-capable loop before hypothesizing. |

Warden's automated PR review and `agents.toml` also pull **remote** specialists (`security-review`, `gha-security-review`, `span-convention-review`, and more) — invoke those for depth beyond the local pass.

## Nested AGENTS.md Files

- [`packages/core/AGENTS.md`](packages/core/AGENTS.md) — TypeScript/JavaScript code style, testing, patterns
- [`packages/core/android/AGENTS.md`](packages/core/android/AGENTS.md) — Java/Kotlin conventions
- [`packages/core/ios/AGENTS.md`](packages/core/ios/AGENTS.md) — Objective-C/Swift conventions
- [`samples/react-native/AGENTS.md`](samples/react-native/AGENTS.md) — Running & troubleshooting the RN sample
- [`samples/expo/AGENTS.md`](samples/expo/AGENTS.md) — Running the Expo sample

## Troubleshooting

**Build Failures:**
- Clear and reinstall: `rm -rf node_modules && yarn install`
- Clean build: `yarn clean && yarn build`

**Test Failures:**
- Clear Jest cache: `jest --clearCache`
- Ensure build is up to date: `yarn build`

**Linting Failures:**
- Auto-fix: `yarn fix`

## Maintenance

When discovering new patterns, add them to the **nearest nested `AGENTS.md`** file. Keep examples concise but complete. Remove outdated information during reviews.
