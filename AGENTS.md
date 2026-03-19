# AGENTS.md

Sentry React Native SDK — monorepo using yarn workspaces with a single package at `packages/core`.

## Agent Responsibilities

- **Continuous Learning**: Document new patterns in the appropriate nested `AGENTS.md` file.
- **Context Management**: After compaction, re-read `AGENTS.md` files relevant to your current task.

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
| TS/JS lint | `yarn lint:lerna` |
| Android lint | `yarn lint:android` |
| Kotlin lint | `yarn lint:kotlin` |
| ObjC/C++ lint | `yarn lint:clang` |
| Swift lint | `yarn lint:swift` |

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
- [ ] Native code formatted correctly
- [ ] TypeScript types are correct
- [ ] Tests added/updated for changes

## CI Overview

Workflows in `.github/workflows/`:

| Workflow | Purpose |
|----------|---------|
| `buildandtest.yml` | TS compilation, Jest tests, linting, circular dep check, TS 3.8 compat |
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
