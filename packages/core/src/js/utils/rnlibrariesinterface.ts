//
// This interface contains all of react-native internals Libraries used in Sentry RN SDK.
//
// Containing the internals in one place enables us to handle platforms
// that don't have all the internals available. For example react-native-web.
//

import type * as ReactNative from '../vendor/react-native';

export type { EmitterSubscription } from 'react-native';

// Codegen matches this type by name, so it does not need the React Native deep import.
export type UnsafeObject = object;

export interface ReactNativeLibrariesInterface {
  Devtools?: {
    parseErrorStack?: (errorStack: string) => Array<ReactNative.StackFrame>;
    symbolicateStackTrace: (
      stack: Array<ReactNative.StackFrame>,
      extraData?: Record<string, unknown>,
    ) => Promise<ReactNative.SymbolicatedStackTrace>;
    getDevServer: () => ReactNative.DevServerInfo;
  };
  Utilities?: {
    polyfillGlobal: <T>(name: string, getValue: () => T) => void;
  };
  Promise?: typeof Promise;
  ReactNativeVersion?: ReactNative.ReactNativeVersion;
  TurboModuleRegistry?: ReactNative.TurboModuleRegistry;
  AppRegistry?: ReactNative.AppRegistry;
  ReactNative?: {
    requireNativeComponent?: <T>(viewName: string) => ReactNative.HostComponent<T>;
  };
}
