import * as React from 'react';
import type { ViewProps } from 'react-native';
import { View } from 'react-native';

const Mask = (props: ViewProps): React.ReactElement => {
  // We have to ensure that the warning is visible even if the app is running without debug
  // eslint-disable-next-line no-console
  console.warn('[SentrySessionReplay] Mask component is not supported on web.');
  return <View {...props} />;
};
const Unmask = (props: ViewProps): React.ReactElement => {
  // We have to ensure that the warning is visible even if the app is running without debug
  // eslint-disable-next-line no-console
  console.warn('[SentrySessionReplay] Unmask component is not supported on web.');
  return <View {...props} />;
};

export { Mask, Unmask };
