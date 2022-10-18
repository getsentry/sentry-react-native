import { addGlobalEventProcessor, getCurrentHub } from '@sentry/core';
import { Context, Event, EventHint, Integration } from '@sentry/types';
import { isFabricEnabled, isHermesEnabled, isTurboModuleEnabled } from '../utils/architecture';
import { ReactNativeError } from "./debugsymbolicator";

interface ReactNativeContext extends Context {
  jsEngine?: 'hermes';
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

      const reactNativeContext: ReactNativeContext = {
        turboModule: isTurboModuleEnabled(),
        fabric: isFabricEnabled(),
      };

      if (isHermesEnabled()) {
        reactNativeContext.jsEngine = 'hermes';
      }

      if (hint?.originalException !== undefined) {
        const reactError = hint.originalException as ReactNativeError;
        reactNativeContext.componentStack = reactError.componentStack;
      }

      event.contexts = {
        react_native_context: reactNativeContext,
        ...event.contexts,
      };

      return event;
    });
  }
}
