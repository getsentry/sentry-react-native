import { RewriteFrames } from '@sentry/integrations';
import type { StackFrame } from '@sentry/types';

/**
 * Creates React Native default rewrite frames integration
 * which appends app:// to the beginning of the filename
 * and removes file://, 'address at' prefixes and CodePush postfix.
 */
export function createReactNativeRewriteFrames(): RewriteFrames {
  return new RewriteFrames({
    iteratee: (frame: StackFrame) => {
      if (frame.filename) {
        frame.filename = frame.filename
          .replace(/^file:\/\//, '')
          .replace(/^address at /, '')
          .replace(/^.*\/[^.]+(\.app|CodePush|.*(?=\/))/, '');

        if (
          frame.filename !== '[native code]' &&
          frame.filename !== 'native'
        ) {
          const appPrefix = 'app://';
          // We always want to have a triple slash
          frame.filename =
            frame.filename.indexOf('/') === 0
              ? `${appPrefix}${frame.filename}`
              : `${appPrefix}/${frame.filename}`;
        }
        delete frame.abs_path;
      }
      return frame;
    },
  });
}
