// Vendored from @facebook/metro

// https://github.com/facebook/metro/blob/93d68cca249202fd3eb52672217e725d90e44eb4/packages/metro/src/lib/countLines.js

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

// This is exported as private from `metro` and as such breaking changes can appear anytime.
// In the past these were related to the way the function is exported. Never to the function itself.
// Thus it should be more stable to vendor it.

const newline = /\r\n?|\n|\u2028|\u2029/g;

export default (string: string): number => (string.match(newline) || []).length + 1;
