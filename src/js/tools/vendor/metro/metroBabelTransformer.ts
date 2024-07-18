// Vendored / modified from @facebook/metro

// https://github.com/facebook/metro/blob/9b295e5f7ecd9cb6332a199bf9cdc1bd8fddf6d9/packages/metro-babel-transformer/types/index.d.ts

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

export interface CustomTransformOptions {
  [key: string]: unknown;
}

export type TransformProfile = 'default' | 'hermes-stable' | 'hermes-canary';

export interface BabelTransformerOptions {
  readonly customTransformOptions?: CustomTransformOptions;
  readonly dev: boolean;
  readonly enableBabelRCLookup?: boolean;
  readonly enableBabelRuntime: boolean | string;
  readonly extendsBabelConfigPath?: string;
  readonly experimentalImportSupport?: boolean;
  readonly hermesParser?: boolean;
  readonly hot: boolean;
  readonly minify: boolean;
  readonly unstable_disableES6Transforms?: boolean;
  readonly platform: string | null;
  readonly projectRoot: string;
  readonly publicPath: string;
  readonly unstable_transformProfile?: TransformProfile;
  readonly globalPrefix: string;
}

export interface BabelTransformerArgs {
  readonly filename: string;
  readonly options: BabelTransformerOptions;
  readonly plugins?: unknown;
  readonly src: string;
}

export interface BabelTransformer {
  transform: (args: BabelTransformerArgs) => {
    ast: unknown;
    metadata: unknown;
  };
  getCacheKey?: () => string;
}
