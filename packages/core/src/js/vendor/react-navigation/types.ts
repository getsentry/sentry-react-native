// MIT License

// Copyright (c) 2017 React Navigation Contributors

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

// https://github.com/react-navigation/react-navigation/blob/a656331009fcb534e0bef535e6df65ae07a228a4/packages/core/src/types.tsx#L777

/**
 * Event which fires when an action is dispatched.
 * Only intended for debugging purposes, don't use it for app logic.
 * This event will be emitted before state changes have been applied.
 */
export type UnsafeAction = {
  data: {
    /**
     * The action object which was dispatched.
     */
    action: {
      readonly type: string;
      readonly payload?: object | undefined;
      readonly source?: string | undefined;
      readonly target?: string | undefined;
    };
    /**
     * Whether the action was a no-op, i.e. resulted any state changes.
     */
    noop: boolean;
    /**
     * Stack trace of the action, this will only be available during development.
     */
    stack: string | undefined;
  };
};
