import type { Event, EventHint, EventProcessor, Integration } from '@sentry/types';
import { resolvedSyncPromise } from '@sentry/utils';

import type { Screenshot as ScreenshotAttachment } from '../wrapper';
import { NATIVE } from '../wrapper';

/** Adds screenshots to error events */
export class Screenshot implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Screenshot';

  /**
   * @inheritDoc
   */
  public name: string = Screenshot.id;

  /**
   * If enabled attaches a screenshot to the event hint.
   *
   * @deprecated Screenshots are now added in global event processor.
   */
  public static attachScreenshotToEventHint(
    hint: EventHint,
    { attachScreenshot }: { attachScreenshot?: boolean },
  ): PromiseLike<EventHint> {
    if (!attachScreenshot) {
      return resolvedSyncPromise(hint);
    }

    return NATIVE.captureScreenshot().then(screenshots => {
      if (screenshots !== null && screenshots.length > 0) {
        hint.attachments = [...screenshots, ...(hint?.attachments || [])];
      }
      return hint;
    });
  }

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (e: EventProcessor) => void): void {
    addGlobalEventProcessor(async (event: Event, hint: EventHint) => {
      const hasException = event.exception && event.exception.values && event.exception.values.length > 0;
      if (!hasException) {
        return event;
      }

      const screenshots: ScreenshotAttachment[] | null = await NATIVE.captureScreenshot();
      if (screenshots && screenshots.length > 0) {
        hint.attachments = [...screenshots, ...(hint?.attachments || [])];
      }

      return event;
    });
  }
}
