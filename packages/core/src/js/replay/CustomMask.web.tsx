import * as React from 'react';
import { View, ViewProps } from 'react-native';

const Mask = (props: ViewProps): React.ReactElement => {
  return (
    <View {...props}>
      <div className='sentry-react-native-mask'>
        {props.children}
      </div>
    </View>
  );
};

const Unmask = (props: ViewProps): React.ReactElement => {
  return (
    <View {...props}>
      <div className='sentry-react-native-unmask'>
        {props.children}
      </div>
    </View>
  );
};

export { Mask, Unmask };
