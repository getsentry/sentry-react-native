import type * as React from 'react';

type FullWindowOverlayComponent = React.ComponentType<{ children?: React.ReactNode }>;

let _resolved = false;
let _component: FullWindowOverlayComponent | undefined;

/**
 * Lazily resolves `FullWindowOverlay` from `react-native-screens`, if installed.
 *
 * On iOS, React Native's `Modal` presents a view controller from the root view
 * controller's chain. When a native-stack screen is already presented (e.g. a
 * `formSheet`/`modal`), UIKit refuses the second presentation and the feedback
 * form silently fails to appear. `FullWindowOverlay` renders above everything in
 * the key window — including presented sheets — so the form shows regardless.
 *
 * `react-native-screens` is an optional dependency: the `require` is wrapped in a
 * try/catch, which Metro treats as an optional import, so bundling still works
 * when it isn't installed. In that case callers fall back to `Modal`.
 */
export function getFullWindowOverlay(): FullWindowOverlayComponent | undefined {
  if (_resolved) {
    return _component;
  }
  _resolved = true;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const screens = require('react-native-screens') as { FullWindowOverlay?: FullWindowOverlayComponent };
    if (screens?.FullWindowOverlay) {
      _component = screens.FullWindowOverlay;
    }
  } catch {
    // react-native-screens is not installed — callers fall back to Modal.
  }

  return _component;
}

/**
 * For testing purposes only.
 */
export function resetFullWindowOverlayCache(): void {
  _resolved = false;
  _component = undefined;
}
