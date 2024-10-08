export interface ExtendedError extends Error {
  framesToPop?: number | undefined;
  cause?: Error | undefined;
}

// Sentry Stack Parser is skipping lines not frames
// https://github.com/getsentry/sentry-javascript/blob/739d904342aaf9327312f409952f14ceff4ae1ab/packages/utils/src/stacktrace.ts#L23
// 1 for first line with the Error message
const SENTRY_STACK_PARSER_OFFSET = 1;
const REMOVE_ERROR_CREATION_FRAMES = 2 + SENTRY_STACK_PARSER_OFFSET;

/**
 * Creates synthetic trace. By default pops 2 frames - `createSyntheticError` and the caller
 */
export function createSyntheticError(framesToPop: number = 0): ExtendedError {
  const error: ExtendedError = new Error();
  error.framesToPop = framesToPop + REMOVE_ERROR_CREATION_FRAMES; // Skip createSyntheticError's own stack frame.
  return error;
}

/**
 * Returns the number of frames to pop from the stack trace.
 * @param error ExtendedError
 */
export function getFramesToPop(error: ExtendedError): number {
  return error.framesToPop !== undefined ? error.framesToPop : 0;
}

/**
 * Check if `potentialError` is an object with string stack property.
 */
export function isErrorLike(potentialError: unknown): potentialError is { stack: string } {
  return (
    potentialError !== null &&
    typeof potentialError === 'object' &&
    'stack' in potentialError &&
    typeof potentialError.stack === 'string'
  );
}
