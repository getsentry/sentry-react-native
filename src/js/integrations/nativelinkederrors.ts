import { exceptionFromError } from '@sentry/browser';
import { convertIntegrationFnToClass } from '@sentry/core';
import type {
  Client,
  DebugImage,
  Event,
  EventHint,
  Exception,
  ExtendedError,
  Integration,
  IntegrationClass,
  IntegrationFnResult,
  StackFrame,
  StackParser,
} from '@sentry/types';
import { isInstanceOf, isPlainObject } from '@sentry/utils';

import type { NativeStackFrames } from '../NativeRNSentry';
import { NATIVE } from '../wrapper';

const INTEGRATION_NAME = 'NativeLinkedErrors';

const DEFAULT_KEY = 'cause';
const DEFAULT_LIMIT = 5;

interface LinkedErrorsOptions {
  key: string;
  limit: number;
}

/**
 * Processes JS and RN native linked errors.
 */
export const nativeLinkedErrorsIntegration = (options: Partial<LinkedErrorsOptions> = {}): IntegrationFnResult => {
  const key = options.key || DEFAULT_KEY;
  const limit = options.limit || DEFAULT_LIMIT;

  return {
    name: INTEGRATION_NAME,
    setupOnce: (): void => {
      // noop
    },
    preprocessEvent: (event: Event, hint: EventHint, client: Client): void =>
      preprocessEvent(event, hint, client, limit, key),
  };
};

/**
 * Processes JS and RN native linked errors.
 *
 * @deprecated Use `nativeLinkedErrorsIntegration()` instead.
 */
// eslint-disable-next-line deprecation/deprecation
export const NativeLinkedErrors = convertIntegrationFnToClass(
  INTEGRATION_NAME,
  nativeLinkedErrorsIntegration,
) as IntegrationClass<Integration> & {
  new (options?: Partial<LinkedErrorsOptions>): Integration;
};

function preprocessEvent(event: Event, hint: EventHint | undefined, client: Client, limit: number, key: string): void {
  if (!event.exception || !event.exception.values || !hint || !isInstanceOf(hint.originalException, Error)) {
    return;
  }

  const parser = client.getOptions().stackParser;

  const { exceptions: linkedErrors, debugImages } = walkErrorTree(
    parser,
    limit,
    hint.originalException as ExtendedError,
    key,
  );
  event.exception.values = [...event.exception.values, ...linkedErrors];

  event.debug_meta = event.debug_meta || {};
  event.debug_meta.images = event.debug_meta.images || [];
  event.debug_meta.images.push(...(debugImages || []));
}

/**
 * Walks linked errors and created Sentry exceptions chain.
 * Collects debug images from native errors stack frames.
 */
function walkErrorTree(
  parser: StackParser,
  limit: number,
  error: ExtendedError,
  key: string,
  exceptions: Exception[] = [],
  debugImages: DebugImage[] = [],
): {
  exceptions: Exception[];
  debugImages?: DebugImage[];
} {
  const linkedError = error[key];
  if (!linkedError || exceptions.length + 1 >= limit) {
    return {
      exceptions,
      debugImages,
    };
  }

  let exception: Exception;
  let exceptionDebugImages: DebugImage[] | undefined;
  if ('stackElements' in linkedError) {
    // isJavaException
    exception = exceptionFromJavaStackElements(linkedError);
  } else if ('stackReturnAddresses' in linkedError) {
    // isObjCException
    const { appleException, appleDebugImages } = exceptionFromAppleStackReturnAddresses(linkedError);
    exception = appleException;
    exceptionDebugImages = appleDebugImages;
  } else if (isInstanceOf(linkedError, Error)) {
    exception = exceptionFromError(parser, error[key]);
  } else if (isPlainObject(linkedError)) {
    exception = {
      type: typeof linkedError.name === 'string' ? linkedError.name : undefined,
      value: typeof linkedError.message === 'string' ? linkedError.message : undefined,
    };
  } else {
    return {
      exceptions,
      debugImages,
    };
  }

  return walkErrorTree(
    parser,
    limit,
    linkedError,
    key,
    [...exceptions, exception],
    [...debugImages, ...(exceptionDebugImages || [])],
  );
}

/**
 * Converts a Java Throwable to an SentryException
 */
function exceptionFromJavaStackElements(javaThrowable: {
  name: string;
  message: string;
  stackElements: {
    className: string;
    fileName: string;
    methodName: string;
    lineNumber: number;
  }[];
}): Exception {
  const nativePackage = fetchNativePackage();
  return {
    type: javaThrowable.name,
    value: javaThrowable.message,
    stacktrace: {
      frames: javaThrowable.stackElements
        .map(
          stackElement =>
            <StackFrame>{
              platform: 'java',
              module: stackElement.className,
              filename: stackElement.fileName,
              lineno: stackElement.lineNumber >= 0 ? stackElement.lineNumber : undefined,
              function: stackElement.methodName,
              in_app: nativePackage !== null && stackElement.className.startsWith(nativePackage) ? true : undefined,
            },
        )
        .reverse(),
    },
  };
}

/**
 * Converts StackAddresses to a SentryException with DebugMetaImages
 */
function exceptionFromAppleStackReturnAddresses(objCException: {
  name: string;
  message: string;
  stackReturnAddresses: number[];
}): {
  appleException: Exception;
  appleDebugImages: DebugImage[];
} {
  const nativeStackFrames = fetchNativeStackFrames(objCException.stackReturnAddresses);

  return {
    appleException: {
      type: objCException.name,
      value: objCException.message,
      stacktrace: {
        frames: (nativeStackFrames && nativeStackFrames.frames.reverse()) || [],
      },
    },
    appleDebugImages: (nativeStackFrames && (nativeStackFrames.debugMetaImages as DebugImage[])) || [],
  };
}

let nativePackage: string | null = null;
/**
 * Fetches the native package/image name from the native layer
 */
function fetchNativePackage(): string | null {
  if (nativePackage === null) {
    nativePackage = NATIVE.fetchNativePackageName();
  }
  return nativePackage;
}

/**
 * Fetches native debug image information on iOS
 */
function fetchNativeStackFrames(instructionsAddr: number[]): NativeStackFrames | null {
  return NATIVE.fetchNativeStackFramesBy(instructionsAddr);
}
