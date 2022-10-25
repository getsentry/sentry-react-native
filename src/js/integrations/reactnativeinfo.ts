import { Runtime, Context, Event, EventHint, EventProcessor, Integration } from '@sentry/types';

import { isFabricEnabled, isHermesEnabled, isTurboModuleEnabled } from '../utils/environment';
import { ReactNativeError } from './debugsymbolicator';

export interface ReactNativeContext extends Context, Runtime {
  type: 'runtime',
  name: 'react-native',
  version?: string,
  raw_description?: string,
  js_engine?: string;
  turbo_module: boolean;
  fabric: boolean;
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
      const reactNativeError = hint?.originalException
        ? hint?.originalException as ReactNativeError
        : undefined;

      const reactNativeContext: ReactNativeContext = {
        type: 'runtime',
        name: 'react-native',
        turbo_module: isTurboModuleEnabled(),
        fabric: isFabricEnabled(),
      };

      if (isHermesEnabled()) {
        reactNativeContext.js_engine = 'hermes';
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
        react_native: reactNativeContext,
        ...event.contexts,
      };

      return event;
    });
  }
}
