// MIT License

// Copyright (c) Meta Platforms, Inc. and affiliates.

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

// Adapted from https://github.com/facebook/react-native/blob/d09c02f9e2d468e4d0bde51890e312ae7003a3e6/packages/react-native/Libraries/Core/NativeExceptionsManager.js#L17
export type StackFrame = {
  column?: number;
  file?: string;
  lineNumber?: number;
  methodName: string;
  collapse?: boolean;
};

// Adapted from https://github.com/facebook/react-native/blob/d09c02f9e2d468e4d0bde51890e312ae7003a3e6/packages/react-native/Libraries/Core/Devtools/symbolicateStackTrace.js#L17
export type CodeFrame = Readonly<{
  content: string;
  location?: {
    [key: string]: unknown;
    row: number;
    column: number;
  };
  fileName: string;
}>;

// Adapted from https://github.com/facebook/react-native/blob/d09c02f9e2d468e4d0bde51890e312ae7003a3e6/packages/react-native/Libraries/Core/Devtools/symbolicateStackTrace.js#L27
export type SymbolicatedStackTrace = Readonly<{
  stack: Array<StackFrame>;
  codeFrame?: CodeFrame;
}>;

// Adapted from https://github.com/facebook/react-native/blob/d09c02f9e2d468e4d0bde51890e312ae7003a3e6/packages/react-native/Libraries/Core/Devtools/getDevServer.js#L17
export type DevServerInfo = {
  [key: string]: unknown;
  url: string;
  fullBundleUrl?: string;
  bundleLoadedFromServer: boolean;
};

// Adapted from https://github.com/facebook/react-native/blob/main/packages/react-native/Libraries/TurboModule/RCTExport.d.ts#L10
type TurboModule = {
  getConstants?(): object;
};

// Adapted from https://github.com/facebook/react-native/blob/d09c02f9e2d468e4d0bde51890e312ae7003a3e6/packages/react-native/Libraries/TurboModule/TurboModuleRegistry.d.ts#L12
export type TurboModuleRegistry = {
  get<T extends TurboModule>(name: string): T | null;
  getEnforcing<T extends TurboModule>(name: string): T;
};

// Adapted from https://github.com/facebook/react-native/blob/3f8340975b35767b192e3118f05d2b039676052e/packages/react-native/types/public/ReactNativeTypes.d.ts#L137
export interface HostComponent<P> extends Pick<React.ComponentClass<P>, Exclude<keyof React.ComponentClass<P>, 'new'>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new (props: P, context?: any): React.Component<P> & Readonly<unknown>;
}

// Adapted from https://github.com/facebook/react-native/blob/575ab7862553d7ad7bc753951ed19dcd50d59b95/packages/react-native/Libraries/Utilities/Platform.d.ts#L23-L28
export type ReactNativeVersion = {
  version: {
    major: number;
    minor: number;
    patch: number;
    prerelease?: number | null | undefined;
  };
};
