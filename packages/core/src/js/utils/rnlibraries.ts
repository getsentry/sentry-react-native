/* oxlint-disable typescript-eslint(no-unsafe-member-access) */
import { AppRegistry, Platform, TurboModuleRegistry } from 'react-native';

import type * as ReactNative from '../vendor/react-native';
import type { ReactNativeLibrariesInterface } from './rnlibrariesinterface';

const InternalReactNativeLibrariesInterface: Required<ReactNativeLibrariesInterface> = {
  Devtools: {
    parseErrorStack: (errorStack: string): Array<ReactNative.StackFrame> => {
      const parseErrorStack = require('react-native/Libraries/Core/Devtools/parseErrorStack');

      if (parseErrorStack.default && typeof parseErrorStack.default === 'function') {
        // Starting with react-native 0.79, the parseErrorStack is a default export
        // https://github.com/facebook/react-native/commit/e5818d92a867dbfa5f60d176b847b1f2131cb6da
        return parseErrorStack.default(errorStack);
      }

      // react-native 0.78 and below
      return parseErrorStack(errorStack);
    },
    symbolicateStackTrace: (
      stack: Array<ReactNative.StackFrame>,
      extraData?: Record<string, unknown>,
    ): Promise<ReactNative.SymbolicatedStackTrace> => {
      const symbolicateStackTrace = require('react-native/Libraries/Core/Devtools/symbolicateStackTrace');

      if (symbolicateStackTrace.default && typeof symbolicateStackTrace.default === 'function') {
        // Starting with react-native 0.79, the symbolicateStackTrace is a default export
        // https://github.com/facebook/react-native/commit/e5818d92a867dbfa5f60d176b847b1f2131cb6da
        return symbolicateStackTrace.default(stack, extraData);
      }

      // react-native 0.78 and below
      return symbolicateStackTrace(stack, extraData);
    },
    getDevServer: (): ReactNative.DevServerInfo => {
      const getDevServer = require('react-native/Libraries/Core/Devtools/getDevServer');

      if (getDevServer.default && typeof getDevServer.default === 'function') {
        // Starting with react-native 0.79, the getDevServer is a default export
        // https://github.com/facebook/react-native/commit/e5818d92a867dbfa5f60d176b847b1f2131cb6da
        return getDevServer.default();
      }

      // react-native 0.78 and below
      return getDevServer();
    },
  },
  Promise: require('react-native/Libraries/Promise'),
  Utilities: {
    polyfillGlobal: <T>(name: string, getValue: () => T): void => {
      const { polyfillGlobal } = require('react-native/Libraries/Utilities/PolyfillFunctions');
      polyfillGlobal(name, getValue);
    },
  },
  ReactNativeVersion: {
    version: Platform.constants?.reactNativeVersion,
  },
  TurboModuleRegistry,
  AppRegistry,
  ReactNative: {
    requireNativeComponent: <T>(viewName: string): ReactNative.HostComponent<T> => {
      const { requireNativeComponent } = require('react-native');
      return requireNativeComponent(viewName);
    },
  },
};

export const ReactNativeLibraries: ReactNativeLibrariesInterface = InternalReactNativeLibrariesInterface;
