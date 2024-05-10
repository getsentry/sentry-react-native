import type { Event, EventHint, Integration } from '@sentry/types';

import type { ReactNativeClient } from '../client';
import type { Screenshot as ScreenshotAttachment } from '../wrapper';
import { NATIVE } from '../wrapper';

/** Adds screenshots to error events */
export const screenshotIntegration = (): Integration => {
  return {
    name: 'Screenshot',
    setupOnce: () => {
      // noop
    },
    processEvent,
  };
};

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
