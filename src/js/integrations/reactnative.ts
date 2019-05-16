import { addGlobalEventProcessor, getCurrentHub } from '@sentry/core';
import { Event, Integration } from '@sentry/types';

// import { normalizeData } from '../normalize';

/** ReactNative Integration */
export class ReactNative implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = ReactNative.id;

  /**
   * @inheritDoc
   */
  public static id: string = 'ReactNative';

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    addGlobalEventProcessor((event: Event) => {
      const self = getCurrentHub().getIntegration(ReactNative);
      if (self) {
        // return normalizeData(event) as Event;
      }
      return event;
    });
  }
}
