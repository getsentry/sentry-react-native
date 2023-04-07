import type { EventProcessor, Integration } from '@sentry/types';

/** Default EventOrigin instrumentation */
export class EventOrigin implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'EventOrigin';

  /**
   * @inheritDoc
   */
  public name: string = EventOrigin.id;

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (e: EventProcessor) => void): void {
    addGlobalEventProcessor(event => {
      event.tags = event.tags ?? {};

      event.tags['event.origin'] = 'javascript';
      event.tags['event.environment'] = 'javascript';

      return event;
    });
  }
}
