import type { HostComponent, ViewProps } from 'react-native';
// The default export exists in the file but eslint doesn't see it
// eslint-disable-next-line import/default
import codegenNativeComponent from 'react-native/Libraries/Utilities/codegenNativeComponent';

// If changed to type NativeProps = ViewProps, react native codegen will fail finding the NativeProps type
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface NativeProps extends ViewProps {}

export default codegenNativeComponent<NativeProps>('RNSentryReplayMask') as HostComponent<NativeProps>;
