import { RewriteFrames } from '@sentry/integrations';
import type { StackFrame } from '@sentry/types';
import { Platform } from 'react-native';

import { isExpo } from '../utils/environment';

/**
 * Creates React Native default rewrite frames integration
 * which appends app:// to the beginning of the filename
 * and removes file://, 'address at' prefixes, CodePush postfix,
 * and Expo bundle postfix.
 */
export function createReactNativeRewriteFrames(): RewriteFrames {
  return new RewriteFrames({
    iteratee: (frame: StackFrame) => {
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

      // Expo adds hash to the end of bundle names
      if (isExpo()) {
        frame.filename = Platform.OS === 'android' ? 'app:///index.android.bundle' : 'app:///main.jsbundle';
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
