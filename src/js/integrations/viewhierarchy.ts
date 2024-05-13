import { convertIntegrationFnToClass } from '@sentry/core';
import type { Attachment, Event, EventHint, Integration, IntegrationClass, IntegrationFnResult } from '@sentry/types';
import { logger } from '@sentry/utils';

import { NATIVE } from '../wrapper';

const filename: string = 'view-hierarchy.json';
const contentType: string = 'application/json';
const attachmentType = 'event.view_hierarchy' as Attachment['attachmentType'];

const INTEGRATION_NAME = 'ViewHierarchy';

/** Adds ViewHierarchy to error events */
export const viewHierarchyIntegration = (): IntegrationFnResult => {
  return {
    name: INTEGRATION_NAME,
    setupOnce: () => {
      // noop
    },
    processEvent,
  };
};

/**
 * Adds ViewHierarchy to error events
 *
 * @deprecated Use `viewHierarchyIntegration()` instead.
 */
// eslint-disable-next-line deprecation/deprecation
export const ViewHierarchy = convertIntegrationFnToClass(
  INTEGRATION_NAME,
  viewHierarchyIntegration,
) as IntegrationClass<Integration>;

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
