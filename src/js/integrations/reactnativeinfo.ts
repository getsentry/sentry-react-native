import type { Context, Event, EventHint, EventProcessor, Integration } from '@sentry/types';

import {
  getHermesVersion,
  getReactNativeVersion,
  isExpo,
  isFabricEnabled,
  isHermesEnabled,
  isTurboModuleEnabled,
} from '../utils/environment';
import type { ReactNativeError } from './debugsymbolicator';

export interface ReactNativeContext extends Context {
  js_engine?: string;
  turbo_module: boolean;
  fabric: boolean;
  expo: boolean;
  hermes_version?: string;
  react_native_version: string;
  component_stack?: string;
}

/** Loads React Native context at runtime */
export class ReactNativeInfo implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'ReactNativeInfo';

  /**
   * @inheritDoc
   */
  public name: string = ReactNativeInfo.id;

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void): void {
    addGlobalEventProcessor(async (event: Event, hint?: EventHint) => {
      const reactNativeError = hint?.originalException ? (hint?.originalException as ReactNativeError) : undefined;

      const reactNativeContext: ReactNativeContext = {
        turbo_module: isTurboModuleEnabled(),
        fabric: isFabricEnabled(),
        react_native_version: getReactNativeVersion(),
        expo: isExpo(),
      };

      if (isHermesEnabled()) {
        reactNativeContext.js_engine = 'hermes';
        const hermesVersion = getHermesVersion();
        if (hermesVersion) {
          reactNativeContext.hermes_version = getHermesVersion();
        }
      } else if (reactNativeError?.jsEngine) {
        reactNativeContext.js_engine = reactNativeError.jsEngine;
      }

      if (reactNativeContext.js_engine === 'hermes') {
        event.tags = {
          hermes: 'true',
          ...event.tags,
        };
      }

      if (reactNativeError?.componentStack) {
        reactNativeContext.component_stack = reactNativeError.componentStack;
      }

      event.contexts = {
        react_native_context: reactNativeContext,
        ...event.contexts,
      };

      return event;
    });
  }
}
