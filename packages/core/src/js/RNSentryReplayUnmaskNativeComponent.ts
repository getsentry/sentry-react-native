import type { HostComponent, ViewProps } from 'react-native';

// The default export exists in the file but the linter doesn't see it
import { codegenNativeComponent } from 'react-native';

// If changed to type NativeProps = ViewProps, react native codegen will fail finding the NativeProps type
export interface NativeProps extends ViewProps {}

export default codegenNativeComponent<NativeProps>('RNSentryReplayUnmask') as HostComponent<NativeProps>;
