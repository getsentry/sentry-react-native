# Supply-chain & dependency provenance

Reference for verifying that third-party references the diff **adds or changes** are real and come from a trusted namespace. Loaded by **code-guidelines** ("Adding dependencies") and cited by **review**'s Correctness axis. Motivated by a real incident: a recommended VS Code extension `nickelpack.oxlint` — the tool (oxlint) is real, but that *publisher* is not its owner (`oxc` is), so contributors were prompted to install code from a namespace a third party controlled.

This complements, not duplicates, the shared `getsentry/skills` coverage RN already pulls via Warden:

- `security-review/references/supply-chain.md` — vulnerable deps, lock files, **dependency confusion**, **typosquatting**, package integrity, private registries.
- `gha-security-review/references/supply-chain.md` — GitHub Actions pinning.

The **additive value here** is provenance of *newly introduced* references (not just known-vulnerable versions), and the surfaces those two miss — chiefly **editor extensions**.

## The rule

For every dependency, extension, or action **added or changed in the diff**, confirm two things before it lands:

1. **It resolves to a real, currently-published artifact.**
2. **Its namespace/publisher is one the project trusts** — not unclaimed, not merely *looking* official.

The tool being real is not enough. A claimable namespace lets an attacker publish code that runs on every contributor's machine or in CI.

## Trust hierarchy (prefer higher)

1. **Under Sentry's own scope/org** — `@sentry/*` on npm, `getsentry/*` for Actions, `io.sentry.*` for Maven.
2. **The artifact's official owner** — the publisher/scope the upstream project itself documents (e.g. the oxc team's `oxc.oxc-vscode`, not a lookalike), ideally a *verified* publisher.
3. **Pinned to an immutable ref** — an exact version (npm) or full commit SHA (Actions), never a floating tag (`latest`, `*`, `^`, `@v6`, a branch).

Treat an unscoped or unfamiliar-publisher name as a supply-chain risk until proven otherwise.

## Surfaces to check (all of these in RN)

| Surface | File(s) | Provenance tell |
|---|---|---|
| npm deps | `package.json`, workspace `package.json`s | unscoped name shadowing an internal/`@sentry` package (dependency confusion); a typo of a popular package; a brand-new/low-download package |
| **Editor extensions** | `.vscode/extensions.json` `recommendations` | the `publisher.name` segment isn't the tool's official publisher (the #6640 case) |
| GitHub Actions | `.github/workflows/*.yml`, `.github/actions/**` `uses:` | unknown org, or not pinned to a full SHA |
| iOS native | `packages/core/*.podspec`, sample `Podfile` | pod/source not from the expected owner |
| Android native | `packages/core/android/build.gradle`, `/android` | coordinate/repository not the expected `io.sentry`/known group |
| Ruby tooling | `Gemfile` | gem not from the expected source |

## Quick verification

```bash
npm view <pkg> maintainers dist-tags time.created   # exists? who owns it? how new?
# VS Code extension: open https://marketplace.visualstudio.com/items?itemName=<publisher>.<name>
#   and confirm <publisher> is the tool's official owner (cross-check the tool's own docs/repo).
# GitHub Action: confirm the org, then pin — resolve the tag to a SHA:
gh api repos/<owner>/<repo>/commits/<tag> --jq .sha
```

## What existing RN checks do and don't cover

- **Dependabot** (`.github/dependabot.yml`: npm, gradle, github-actions) — updates and alerts on **known-vulnerable versions of deps you already have**. It does **not** vet a *newly added* name for provenance, and does **not** cover `.vscode` extensions.
- **CodeQL** — code SAST, not dependency provenance.
- **Warden → remote `security-review` / `gha-security-review`** — the shared supply-chain references above; best-effort, registry/CI-framed, and silent on editor extensions.

So the diff-time provenance check — especially for editor extensions — is on the reviewer. This doc is that checklist.

## Checklist for a dependency/extension/action change

- [ ] The artifact exists and is currently published
- [ ] Its scope/publisher/org is Sentry's or the artifact's documented official owner (not a lookalike)
- [ ] Pinned to an exact version / full SHA, not a floating tag
- [ ] If it shadows an internal name, the scope makes confusion impossible
- [ ] For a `.vscode` recommendation: the `publisher` segment is verified against the tool's own docs
