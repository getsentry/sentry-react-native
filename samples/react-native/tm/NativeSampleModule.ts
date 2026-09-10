import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  /** Synchronous C++ TurboModule call, used to exercise sync TurboModule instrumentation. */
  readonly add: (a: number, b: number) => number;
  readonly crash: () => void;
}

export default TurboModuleRegistry.get<Spec>('NativeSampleModule');
