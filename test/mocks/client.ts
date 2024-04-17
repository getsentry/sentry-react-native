import { BaseClient, createTransport, initAndBind } from '@sentry/core';
import type {
  ClientOptions,
  Event,
  EventHint,
  Integration,
  Outcome,
  ParameterizedString,
  Session,
  SeverityLevel,
} from '@sentry/types';
import { resolvedSyncPromise } from '@sentry/utils';

export function getDefaultTestClientOptions(options: Partial<TestClientOptions> = {}): TestClientOptions {
  return {
    dsn: 'https://1234@some-domain.com/4505526893805568',
    enabled: true,
    integrations: [],
    sendClientReports: true,
    transport: () =>
      createTransport(
        {
          recordDroppedEvent: () => undefined,
        }, // noop
        _ => resolvedSyncPromise({}),
      ),
    stackParser: () => [],
    ...options,
  };
}

export interface TestClientOptions extends ClientOptions {
  test?: boolean;
  mockInstallFailure?: boolean;
  enableSend?: boolean;
  defaultIntegrations?: Integration[] | false;
}

export class TestClient extends BaseClient<TestClientOptions> {
  public static instance?: TestClient;
  public static sendEventCalled?: (event: Event) => void;

  public event?: Event;
  public eventQueue: Array<Event> = [];
  public hint?: EventHint;
  public session?: Session;

  public constructor(options: TestClientOptions) {
    super(options);
    TestClient.instance = this;
  }

  public eventFromException(exception: any): PromiseLike<Event> {
    const event: Event = {
      exception: {
        values: [
          {
            type: exception.name,
            value: exception.message,
            /* eslint-enable @typescript-eslint/no-unsafe-member-access */
          },
        ],
      },
    };

    const frames = this._options.stackParser(exception.stack || '', 1);
    if (frames.length && event?.exception?.values?.[0]) {
      event.exception.values[0] = { ...event.exception.values[0], stacktrace: { frames } };
    }

    return resolvedSyncPromise(event);
  }

  public eventFromMessage(message: ParameterizedString, level: SeverityLevel = 'info'): PromiseLike<Event> {
    return resolvedSyncPromise({ message, level });
  }

  public sendEvent(event: Event, hint?: EventHint): void {
    this.event = event;
    this.eventQueue.push(event);
    this.hint = hint;

    // In real life, this will get deleted as part of envelope creation.
    delete event.sdkProcessingMetadata;

    if (this._options.enableSend) {
      super.sendEvent(event, hint);
      return;
    }
    TestClient.sendEventCalled && TestClient.sendEventCalled(event);
  }

  public sendSession(session: Session): void {
    this.session = session;
  }

  // Public proxy for protected method
  public _clearOutcomes(): Outcome[] {
    return super._clearOutcomes();
  }
}

export function init(options: TestClientOptions): void {
  initAndBind(TestClient, options);
}
