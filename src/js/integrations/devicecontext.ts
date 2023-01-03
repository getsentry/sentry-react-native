/* eslint-disable complexity */
import { Breadcrumb, Event, EventProcessor, Hub, Integration } from '@sentry/types';
import { logger, severityLevelFromString } from '@sentry/utils';

import { breadcrumbEquals, breadcrumbFromObject } from '../breadcrumb';
import { NativeDeviceContextsResponse } from '../definitions';
import { NATIVE } from '../wrapper';

/** Load device context from native. */
export class DeviceContext implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'DeviceContext';

  /**
   * @inheritDoc
   */
  public name: string = DeviceContext.id;

  /**
   * @inheritDoc
   */
  public setupOnce(
    addGlobalEventProcessor: (callback: EventProcessor) => void,
    getCurrentHub: () => Hub,
  ): void {
    addGlobalEventProcessor(async (event: Event) => {
      const self = getCurrentHub().getIntegration(DeviceContext);
      if (!self) {
        return event;
      }

      let contexts: NativeDeviceContextsResponse | null = null;
      try {
        contexts = await NATIVE.fetchNativeDeviceContexts();
      } catch (e) {
        logger.log(`Failed to get device context from native: ${e}`);
      }

      if (!contexts) {
        return event;
      }

      const nativeUser = contexts['user'] as Event['user'];
      if (!event.user && nativeUser) {
        event.user = nativeUser;
      }

      const nativeContext = contexts['context'] as Event['contexts'];
      if (nativeContext) {
        event.contexts = { ...nativeContext, ...event.contexts };
      }

      const nativeTags = contexts['tags'] as Event['tags'];
      if (nativeTags) {
        event.tags = { ...nativeTags, ...event.tags };
      }

      const nativeExtra = contexts['extra'] as Event['extra'];
      if (nativeExtra) {
        event.extra = { ...nativeExtra, ...event.extra };
      }

      const nativeFingerprint = contexts['fingerprint'] as Event['fingerprint'];
      if (nativeFingerprint) {
        event.fingerprint = (event.fingerprint ?? []).concat(
          nativeFingerprint.filter((item) => (event.fingerprint ?? []).indexOf(item) < 0),
        )
      }

      const nativeLevel = typeof contexts['level'] === 'string'
        ? severityLevelFromString(contexts['level'])
        : undefined;
      if (!event.level && nativeLevel) {
        event.level = nativeLevel;
      }

      const nativeEnvironment = contexts['environment'] as Event['environment'];
      if (!event.environment && nativeEnvironment) {
        event.environment = nativeEnvironment;
      }

      const nativeBreadcrumbs = Array.isArray(contexts['breadcrumbs'])
        ? contexts['breadcrumbs'].map(breadcrumbFromObject)
        : undefined;
      if (nativeBreadcrumbs) {
        event.breadcrumbs = event.breadcrumbs ?? []
        for (const breadcrumb of nativeBreadcrumbs ?? []) {
          const equals = (b: Breadcrumb): boolean => breadcrumbEquals(b, breadcrumb);
          const exists = event.breadcrumbs.findIndex(equals) >= 0;
          if (!exists) {
            event.breadcrumbs.push(breadcrumb);
          }
        }
        event.breadcrumbs = event.breadcrumbs.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
      }

      return event;
    });
  }
}
