import type { EventProcessor, Hub, Integration } from '@sentry/types';
import { logger, timestampInSeconds } from '@sentry/utils';
import type { AppStateStatus } from 'react-native';
import { AppState } from 'react-native';

/**
 * Creates spans for the period of time that the App is in background
 * (not active)
 */
export class BackgroundSpans implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'BackgroundSpans';

  /**
   * @inheritDoc
   */
  public name: string = BackgroundSpans.id;

  private _currentBackgroundStartTimestamp: number | undefined;

  /**
   * @inheritDoc
   */
  public setupOnce(
    _: (e: EventProcessor) => void,
    getCurrentHub: () => Hub,
  ): void {
    if (!AppState.isAvailable || typeof AppState.addEventListener !== 'function') {
      logger.warn('AppState is not available on this platform, BackgroundSpans Integration will not work.');
      return;
    }

    AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && this._currentBackgroundStartTimestamp) {
        const hub = getCurrentHub();
        const tx = hub.getScope().getTransaction();
        tx && tx.startChild({
          startTimestamp: this._currentBackgroundStartTimestamp,
          endTimestamp: timestampInSeconds(),
          description: 'App in background',
          op: 'app.background',
        });
        this._currentBackgroundStartTimestamp = undefined;
      } else if (state === 'background' || state === 'inactive' && !this._currentBackgroundStartTimestamp) {
        this._currentBackgroundStartTimestamp = timestampInSeconds();
      } else {
        logger.warn(`AppState changed to unknown state: ${state}`);
      }
    });
  }
}
