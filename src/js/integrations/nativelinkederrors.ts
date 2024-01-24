import { exceptionFromError } from '@sentry/browser';
import type {
  Client,
  DebugImage,
  Event,
  EventHint,
  EventProcessor,
  Exception,
  ExtendedError,
  Hub,
  Integration,
  StackFrame,
  StackParser,
} from '@sentry/types';
import { isInstanceOf, isPlainObject } from '@sentry/utils';

import type { NativeStackFrames } from '../NativeRNSentry';
import { NATIVE } from '../wrapper';

const DEFAULT_KEY = 'cause';
const DEFAULT_LIMIT = 5;

interface LinkedErrorsOptions {
  key: string;
  limit: number;
}

/**
 * Processes JS and RN native linked errors.
 */
export class NativeLinkedErrors implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'NativeLinkedErrors';

  /**
   * @inheritDoc
   */
  public name: string = NativeLinkedErrors.id;

  private readonly _key: LinkedErrorsOptions['key'];
  private readonly _limit: LinkedErrorsOptions['limit'];
  private _nativePackage: string | null = null;

  /**
   * @inheritDoc
   */
  public constructor(options: Partial<LinkedErrorsOptions> = {}) {
    this._key = options.key || DEFAULT_KEY;
    this._limit = options.limit || DEFAULT_LIMIT;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_addGlobalEventProcessor: (callback: EventProcessor) => void, _getCurrentHub: () => Hub): void {
    /* noop */
  }

  /**
   * @inheritDoc
   */
  public preprocessEvent(event: Event, hint: EventHint | undefined, client: Client): void {
    if (this._nativePackage === null) {
      this._nativePackage = this._fetchNativePackage();
    }

    this._handler(client.getOptions().stackParser, this._key, this._limit, event, hint);
  }

  /**
   * Enriches passed event with linked exceptions and native debug meta images.
   */
  private _handler(parser: StackParser, key: string, limit: number, event: Event, hint?: EventHint): void {
    if (!event.exception || !event.exception.values || !hint || !isInstanceOf(hint.originalException, Error)) {
      return;
    }
    const { exceptions: linkedErrors, debugImages } = this._walkErrorTree(
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
  private _walkErrorTree(
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
      exception = this._exceptionFromJavaStackElements(linkedError);
    } else if ('stackReturnAddresses' in linkedError) {
      // isObjCException
      const { appleException, appleDebugImages } = this._exceptionFromAppleStackReturnAddresses(linkedError);
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

    return this._walkErrorTree(
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
  private _exceptionFromJavaStackElements(javaThrowable: {
    name: string;
    message: string;
    stackElements: {
      className: string;
      fileName: string;
      methodName: string;
      lineNumber: number;
    }[];
  }): Exception {
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
                in_app:
                  this._nativePackage !== null && stackElement.className.startsWith(this._nativePackage)
                    ? true
                    : undefined,
              },
          )
          .reverse(),
      },
    };
  }

  /**
   * Converts StackAddresses to a SentryException with DebugMetaImages
   */
  private _exceptionFromAppleStackReturnAddresses(objCException: {
    name: string;
    message: string;
    stackReturnAddresses: number[];
  }): {
    appleException: Exception;
    appleDebugImages: DebugImage[];
  } {
    const nativeStackFrames = this._fetchNativeStackFrames(objCException.stackReturnAddresses);

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

  /**
   * Fetches the native package/image name from the native layer
   */
  private _fetchNativePackage(): string | null {
    return NATIVE.fetchNativePackageName();
  }

  /**
   * Fetches native debug image information on iOS
   */
  private _fetchNativeStackFrames(instructionsAddr: number[]): NativeStackFrames | null {
    return NATIVE.fetchNativeStackFramesBy(instructionsAddr);
  }
}
