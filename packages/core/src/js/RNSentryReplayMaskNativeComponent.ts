import type { HostComponent, ViewProps } from 'react-native';
// The default export exists in the file but eslint doesn't see it
// eslint-disable-next-line import/default
import codegenNativeComponent from 'react-native/Libraries/Utilities/codegenNativeComponent';

export type NativeProps = ViewProps;

export default codegenNativeComponent<NativeProps>('RNSentryReplayMask') as HostComponent<NativeProps>;
