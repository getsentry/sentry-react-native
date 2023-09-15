import { RewriteFrames } from '@sentry/integrations';
import type { StackFrame } from '@sentry/types';
import { Platform } from 'react-native';

import { isExpo, isHermesEnabled } from '../utils/environment';

export const ANDROID_DEFAULT_BUNDLE_NAME = 'app:///index.android.bundle';
export const IOS_DEFAULT_BUNDLE_NAME = 'app:///main.jsbundle';

/**
 * Creates React Native default rewrite frames integration
 * which appends app:// to the beginning of the filename
 * and removes file://, 'address at' prefixes, CodePush postfix,
 * and Expo bundle postfix.
 */
export function createReactNativeRewriteFrames(): RewriteFrames {
  return new RewriteFrames({
    iteratee: (frame: StackFrame) => {
      if (frame.platform === 'java' || frame.platform === 'cocoa') {
        // Because platform is not required in StackFrame type
        // we assume that if not set it's javascript
        return frame;
      }

      if (!frame.filename) {
        return frame;
      }
      delete frame.abs_path;

      frame.filename = frame.filename
        .replace(/^file:\/\//, '')
        .replace(/^address at /, '')
        .replace(/^.*\/[^.]+(\.app|CodePush|.*(?=\/))/, '');

      if (frame.filename === '[native code]' || frame.filename === 'native') {
        return frame;
      }
      // Is React Native frame
      if (isHermesEnabled() && frame.colno !== undefined) {
        // https://github.com/facebook/react/issues/21792#issuecomment-873171991
        // hermes columns are 0-based, while v8 and jsc are 1-based
        // TODO: This seems to be needed only for Hermes bytecode without debug information
        frame.colno += 1;
      }

      // Expo adds hash to the end of bundle names
      if (isExpo() && Platform.OS === 'android') {
        frame.filename = ANDROID_DEFAULT_BUNDLE_NAME;
        return frame;
      }

      if (isExpo() && Platform.OS === 'ios') {
        frame.filename = IOS_DEFAULT_BUNDLE_NAME;
        return frame;
      }

      const appPrefix = 'app://';
      // We always want to have a triple slash
      frame.filename =
        frame.filename.indexOf('/') === 0 ? `${appPrefix}${frame.filename}` : `${appPrefix}/${frame.filename}`;
      return frame;
    },
  });
}
