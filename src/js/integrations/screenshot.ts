import { convertIntegrationFnToClass } from '@sentry/core';
import type { Event, EventHint, Integration, IntegrationClass, IntegrationFnResult } from '@sentry/types';

import type { ReactNativeClient } from '../client';
import type { Screenshot as ScreenshotAttachment } from '../wrapper';
import { NATIVE } from '../wrapper';

const INTEGRATION_NAME = 'Screenshot';

/** Adds screenshots to error events */
export const screenshotIntegration = (): IntegrationFnResult => {
  return {
    name: INTEGRATION_NAME,
    setupOnce: () => {
      // noop
    },
    processEvent,
  };
};

/**
 * Adds screenshots to error events
 *
 * @deprecated Use `screenshotIntegration()` instead.
 */
// eslint-disable-next-line deprecation/deprecation
export const Screenshot = convertIntegrationFnToClass(
  INTEGRATION_NAME,
  screenshotIntegration,
) as IntegrationClass<Integration>;

async function processEvent(event: Event, hint: EventHint, client: ReactNativeClient): Promise<Event> {
  const options = client.getOptions();

  const hasException = event.exception && event.exception.values && event.exception.values.length > 0;
  if (!hasException || options?.beforeScreenshot?.(event, hint) === false) {
    return event;
  }

  const screenshots: ScreenshotAttachment[] | null = await NATIVE.captureScreenshot();
  if (screenshots && screenshots.length > 0) {
    hint.attachments = [...screenshots, ...(hint?.attachments || [])];
  }

  return event;
}
