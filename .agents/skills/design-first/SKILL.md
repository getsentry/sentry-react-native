---
name: design-first
description: Shape non-trivial work before writing it — decide the modules, the seams, and the public API surface up front. Use when starting a feature, adding an integration, changing the public barrel (`packages/core/src/js/index.ts`), crossing the JS↔native bridge, changing a codegen spec, or deciding where a seam should go. Produces a design sketch to approve before implementation, then hands off to code-guidelines and test-guidelines.
---

Design the shape before writing the code. The pass ends in a **design sketch** the user approves; implementation does not start until it does. Aim for **deep modules** placed at clean **seams** — so callers get leverage, maintainers get locality, and tests get a surface to push against.

This is a design pass, not an implementation plan. Decide *what shape the code takes and why*; leave line-level rules to **code-guidelines** and test structure to **test-guidelines**.

## When to run

Run for work where the shape is a real decision:

- A new feature or a new integration
- A change to the public barrel (`packages/core/src/js/index.ts`) or a public option in `options.ts` — it cascades to every downstream user and the API report
- A change to a **codegen spec** (`src/js/NativeRNSentry.ts`, `*NativeComponent.ts`) or anything crossing the JS↔native bridge — the ABI must move in lockstep across JS/iOS/Android
- Any moment you are choosing where a seam goes, or how a module is shaped to be testable

Skip it — and say you are skipping it — for one-line fixes, localized bug fixes with obvious placement, and refactors that change no interface.

## Vocabulary

Use these terms exactly in the sketch — consistent language is what makes the design legible across sessions. Don't substitute "component," "service," or "layer."

- **Module** — anything with an interface and an implementation: a function, a factory, a class, a file.
- **Interface** — everything a caller must know to use it correctly: the signature, plus invariants, ordering, error modes, required config.
- **Deep module** — a lot of behavior behind a small interface. The goal. A **shallow** module has an interface nearly as complex as its implementation — avoid it.
- **Seam** — the place where you can swap behavior without editing in that place. Where an interface lives, and where a test double crosses. In this SDK the biggest seam is the `NATIVE` wrapper (`src/js/wrapper.ts`) between JS and native.
- **Adapter** — a concrete thing satisfying an interface at a seam.

Two checks settle most design questions:

- **The deletion test.** Imagine deleting the module. If complexity vanishes, it was a pass-through — don't build it. If complexity reappears across N callers, it earns its keep.
- **The interface is the test surface.** Callers and tests cross the same seam. If you need to test *past* the interface, the module is the wrong shape.

## The design pass

### 1. Frame the change

State the behavior the change introduces, in the domain's own words. Name the surface(s) it lands in — JS, Android, iOS, bridge — and read the relevant `AGENTS.md` (root, `packages/core/`, `packages/core/android/`, `packages/core/ios/`).

**Find the nearest well-shaped precedent and align to it.** The codebase has almost certainly solved something adjacent — locate its *best* current example and match it, or improve on it deliberately and say why. The TurboModule subsystem (`turbomodule/` + thin `integrations/turboModuleContext*.ts` wiring) is a strong precedent for a cohesive feature that touches JS, native, and the bridge; the integration factory in `integrations/nativelinkederrors.ts` is the precedent for a plain JS integration.

### 2. Shape the modules

Decide the modules and where their seams go. Prefer fewer, deeper modules over many shallow ones. For each module, name its interface — not just the signature, but the invariants and error modes a caller must know. Run the deletion test on anything you suspect is a pass-through.

Decide where the code lives as part of shaping it — a **locality** call: co-locate what changes together so one change stays directory-local.

- A cohesive subsystem owns its model, lifecycle, and pipeline as one **concept** — group it in its own dir (like `turbomodule/`), and let the `integrations/` file be thin wiring. `integrations/` is a type-bucket, not a home for a subsystem's logic.
- Native code belongs behind the bridge seam under `packages/core/android/` and `packages/core/ios/`; JS features *call* it via `NATIVE`, they don't embed native code.
- **If you can't name the concern a piece serves, that's a smell** — it's doing two things, or belongs to a concept you haven't named.

### 3. Design for testability

A seam exists so a test can cross it (test-guidelines builds the fakes there). Three rules make that possible:

- **Accept dependencies, don't create them.** A module that reaches for `NativeModules.RNSentry` itself can't be faked; one that receives the bridge (or goes through the `NATIVE` seam a test can mock) can.
- **Keep the platform/arch branch at the edge.** Push `Platform.OS` / `isTurboModuleEnabled()` decisions to a thin boundary so the core logic is arch-agnostic and unit-testable without simulating a device.
- **Make the observable output the contract.** Tests assert on the produced event/envelope/resolved value, not on private state — so the design must route results through the interface.

### 4. Account for the bridge, up front

If the change crosses the bridge, decide *now* (not during implementation):

- What the payload shape is and whether it is **codegen-expressible** or must be an `Object` validated natively (see `code-guidelines/references/native-bridge.md`).
- Whether it's an **ABI change** and how JS/iOS/Android land in lockstep while staying backward-compatible with older cached native binaries.
- How it behaves when `enableNative` is false or the module isn't linked.
- What crosses regarding **PII** and how it's gated.

### 5. Write the sketch and get sign-off

Produce, in the conversation: the modules and their interfaces; where each lives and why (locality); the seams and what fakes cross them; the bridge/ABI decisions; and what you deliberately chose *not* to build (deletion-test casualties). Get the user's approval before implementing, then hand off to **code-guidelines** + **test-guidelines**.
