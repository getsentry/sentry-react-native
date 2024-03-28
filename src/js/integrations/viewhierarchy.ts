import type { Attachment, Event, EventHint, Integration } from '@sentry/types';
import { logger } from '@sentry/utils';

import { NATIVE } from '../wrapper';

const filename: string = 'view-hierarchy.json';
const contentType: string = 'application/json';
const attachmentType: Attachment['attachmentType'] = 'event.view_hierarchy';

/** Adds ViewHierarchy to error events */
export const viewHierarchyIntegration = (): Integration => {
  return {
    name: 'ViewHierarchy',
    setupOnce: () => {
      // noop
    },
    processEvent,
  };
};

async function processEvent(event: Event, hint: EventHint): Promise<Event> {
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
        filename,
        contentType,
        attachmentType,
        data: viewHierarchy,
      },
      ...(hint?.attachments || []),
    ];
  }

  return event;
}
