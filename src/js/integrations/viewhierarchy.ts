import type { Event, EventHint, EventProcessor, Integration } from '@sentry/types';
import { logger } from '@sentry/utils';

import { NATIVE } from '../wrapper';

/** Adds ViewHierarchy to error events */
export class ViewHierarchy implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'ViewHierarchy';

  private static _fileName: string = 'view-hierarchy.json';
  private static _contentType: string = 'application/json';
  private static _attachmentType: string = 'event.view_hierarchy';

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

      let viewHierarchy: Uint8Array | null = null;
      try {
        viewHierarchy = await NATIVE.fetchViewHierarchy();
      } catch (e) {
        logger.error('Failed to get view hierarchy from native.', e);
      }

      if (viewHierarchy) {
        hint.attachments = [
          {
            filename: ViewHierarchy._fileName,
            contentType: ViewHierarchy._contentType,
            attachmentType: ViewHierarchy._attachmentType,
            data: viewHierarchy,
          },
          ...(hint?.attachments || []),
        ];
      }

      return event;
    });
  }
}
