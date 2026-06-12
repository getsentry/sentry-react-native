import type {
  Client,
  DebugImage,
  Event,
  EventHint,
  Exception,
  ExtendedError,
  Integration,
  StackFrame,
  StackParser,
} from '@sentry/core';

import { exceptionFromError } from '@sentry/browser';
import { isInstanceOf, isPlainObject, isString } from '@sentry/core';

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
export const nativeLinkedErrorsIntegration = (options: Partial<LinkedErrorsOptions> = {}): Integration => {
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

function preprocessEvent(event: Event, hint: EventHint | undefined, client: Client, limit: number, key: string): void {
  if (!event.exception?.values || !hint || !isInstanceOf(hint.originalException, Error)) {
    return;
  }

  const parser = client.getOptions().stackParser;
  const originalException = hint.originalException as ExtendedError;

  const { exceptions: linkedErrors, debugImages } = walkErrorTree(parser, limit, originalException, key);

  const nativeStackAndroidException = exceptionFromNativeStackAndroid(originalException);
  if (nativeStackAndroidException && linkedErrors.length + 1 < limit) {
    linkedErrors.push(nativeStackAndroidException);
  }

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
  if (isString(linkedError)) {
    exception = {
      value: linkedError,
    };
  } else if ('stackElements' in linkedError) {
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
    // oxlint-disable-next-line typescript-eslint(no-unnecessary-type-assertion)
    const plainError = linkedError as Record<string, unknown>;
    exception = {
      type: typeof plainError.name === 'string' ? plainError.name : undefined,
      value: typeof plainError.message === 'string' ? plainError.message : undefined,
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
        .map(stackElement =>
          javaStackFrame(
            stackElement.className,
            stackElement.fileName,
            stackElement.methodName,
            stackElement.lineNumber,
            nativePackage,
          ),
        )
        .reverse(),
    },
  };
}

/**
 * Converts the `nativeStackAndroid` frames attached to errors from rejected promises
 * (`Promise.reject(code, message, throwable, userInfo)`, see Android's `PromiseImpl.java`) to a SentryException.
 */
function exceptionFromNativeStackAndroid(error: ExtendedError): Exception | undefined {
  const nativeStackAndroid = error.nativeStackAndroid as
    | {
        class: string;
        file: string;
        lineNumber: number;
        methodName: string;
      }[]
    | undefined;

  if (!Array.isArray(nativeStackAndroid) || nativeStackAndroid.length === 0) {
    return undefined;
  }

  const nativePackage = fetchNativePackage();
  return {
    type: error.name,
    value: error.message,
    stacktrace: {
      frames: nativeStackAndroid
        .map(frame => javaStackFrame(frame.class, frame.file, frame.methodName, frame.lineNumber, nativePackage))
        .reverse(),
    },
  };
}

/**
 * Converts a Java stack trace element to a Sentry stack frame.
 */
function javaStackFrame(
  className: string,
  fileName: string,
  methodName: string,
  lineNumber: number,
  nativePackage: string | null,
): StackFrame {
  return {
    platform: 'java',
    module: className,
    filename: fileName,
    lineno: lineNumber >= 0 ? lineNumber : undefined,
    function: methodName,
    in_app: nativePackage !== null && className.startsWith(nativePackage) ? true : undefined,
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
        frames: nativeStackFrames?.frames.reverse() || [],
      },
    },
    appleDebugImages: (nativeStackFrames?.debugMetaImages as DebugImage[]) || [],
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
