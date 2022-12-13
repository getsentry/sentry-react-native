import { resolvedSyncPromise } from '@sentry/utils';
import { StackParser, Severity, SeverityLevel, EventHint, Event, Thread } from '@sentry/types';
import { parseStackFrames } from '@sentry/browser/cjs/eventbuilder';

export { eventFromException } from '@sentry/browser/cjs/eventbuilder';

/**
 * @hidden
 * To be removed after update to JS SDK v8
 */
interface EventWithThreads extends Event {
  threads?: {
    values: Thread[];
  };
}

/**
 * Builds and Event from a Message
 * @hidden
 */
export function eventFromMessage(
  stackParser: StackParser,
  message: string,
  // eslint-disable-next-line deprecation/deprecation
  level: Severity | SeverityLevel = 'info',
  hint?: EventHint,
  attachStacktrace?: boolean,
): PromiseLike<Event> {
  const syntheticException = (hint && hint.syntheticException) || undefined;
  const event = messageEventFromString(stackParser, message, syntheticException, attachStacktrace);
  event.level = level;
  if (hint && hint.event_id) {
    event.event_id = hint.event_id;
  }
  return resolvedSyncPromise(event);
}

/**
 * @hidden
 */
export function messageEventFromString(
  stackParser: StackParser,
  input: string,
  syntheticException?: Error,
  attachStacktrace?: boolean,
): Event {
  const event: EventWithThreads = {
    message: input,
  };

  if (attachStacktrace && syntheticException) {
    const frames = parseStackFrames(stackParser, syntheticException);
    if (frames.length) {
      event.threads = {
        values: [{ stacktrace: { frames } }],
      };
    }
  }

  return event;
}
