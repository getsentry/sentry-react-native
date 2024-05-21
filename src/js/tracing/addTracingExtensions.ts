/**
 * Adds React Native's extensions. Needs to be called before any transactions are created.
 */
export function _addTracingExtensions(): void {
  // TODO: addTracingExtensions(); likely not needed in RN as it instruments global onerror and onunhandledrejections which are not use in RN
  // TODO: patch replacement of startTransaction -> use `spanStart` client event
}
