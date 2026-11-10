import type { HostComponent, ViewProps } from 'react-native';

// The default export exists in the file but the linter doesn't see it
import { codegenNativeComponent } from 'react-native';

export interface NativeProps extends ViewProps {
  initialDisplay?: boolean;
  fullDisplay?: boolean;
  parentSpanId?: string;
}

// Only iOS builds without the legacy interop layer use this component. Android has no flag to remove
// interop, so it keeps its legacy view manager (see `componentDescriptors` in react-native.config.js).
export default codegenNativeComponent<NativeProps>('RNSentryOnDrawReporter', {
  excludedPlatforms: ['android'],
}) as HostComponent<NativeProps>;
