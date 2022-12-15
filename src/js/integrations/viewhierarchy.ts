import { Event, EventHint, EventProcessor, Integration } from '@sentry/types';

import { NATIVE } from '../wrapper';

/** Adds ViewHierarchy to error events */
export class ViewHierarchy implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'ViewHierarchy';

  private static fileName = 'view-hierarchy.json';
  private static contentType = 'application/json';

  /**
   * @inheritDoc
   */
  public name: string = ViewHierarchy.id;

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (e: EventProcessor) => void): void {
    addGlobalEventProcessor(async (event: Event, hint: EventHint) => {
      const hasException = event.exception && event.exception.values && event.exception.values.length > 0;
      if (!hasException) {
        return event;
      }

      const viewHierarchy = await NATIVE.fetchViewHierarchy()
      hint.attachments = [
        {
          filename: ViewHierarchy.fileName,
          contentType: ViewHierarchy.contentType,
          data: viewHierarchy,
        },
        ...(hint?.attachments || []),
      ];

      return event;
    });
  }
}
