/* eslint-disable @typescript-eslint/no-var-requires */

import { Platform, TurboModuleRegistry } from 'react-native';

import type * as ReactNative from '../vendor/react-native';
import type { ReactNativeLibrariesInterface } from './rnlibrariesinterface';

export const ReactNativeLibraries: Required<ReactNativeLibrariesInterface> = {
  Devtools: {
    parseErrorStack: (errorStack: string): Array<ReactNative.StackFrame> => {
      const parseErrorStack = require('react-native/Libraries/Core/Devtools/parseErrorStack');
      return parseErrorStack(errorStack);
    },
    symbolicateStackTrace: (
      stack: Array<ReactNative.StackFrame>,
      extraData?: Record<string, unknown>,
    ): Promise<ReactNative.SymbolicatedStackTrace> => {
      const symbolicateStackTrace = require('react-native/Libraries/Core/Devtools/symbolicateStackTrace');
      return symbolicateStackTrace(stack, extraData);
    },
    getDevServer: (): ReactNative.DevServerInfo => {
      const getDevServer = require('react-native/Libraries/Core/Devtools/getDevServer');
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
  ReactNative: {
    requireNativeComponent: <T>(viewName: string): ReactNative.HostComponent<T> => {
      const { requireNativeComponent } = require('react-native');
      return requireNativeComponent(viewName);
    },
  },
};
