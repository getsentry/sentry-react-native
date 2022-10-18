import { addGlobalEventProcessor, getCurrentHub } from '@sentry/core';
import { Context, Event, EventHint, Integration } from '@sentry/types';
import { isFabricEnabled, isHermesEnabled, isTurboModuleEnabled } from '../utils/architecture';
import { ReactNativeError } from "./debugsymbolicator";

interface ReactNativeContext extends Context {
  jsEngine?: string;
  turboModule: boolean;
  fabric: boolean;
  componentStack?: string;
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
  public setupOnce(): void {
    addGlobalEventProcessor(async (event: Event, hint?: EventHint) => {
      const self = getCurrentHub().getIntegration(ReactNativeInfo);
      if (!self) {
        return event;
      }

      const reactNativeError = hint?.originalException
        ? hint?.originalException as ReactNativeError
        : undefined;

      const reactNativeContext: ReactNativeContext = {
        turboModule: isTurboModuleEnabled(),
        fabric: isFabricEnabled(),
      };

      if (isHermesEnabled()) {
        reactNativeContext.jsEngine = 'hermes';
      } else if (reactNativeError?.jsEngine) {
        reactNativeContext.jsEngine = reactNativeError.jsEngine;
      }

      if (reactNativeError?.componentStack) {
        reactNativeContext.componentStack = reactNativeError.componentStack;
      }

      event.contexts = {
        react_native_context: reactNativeContext,
        ...event.contexts,
      };

      return event;
    });
  }
}
