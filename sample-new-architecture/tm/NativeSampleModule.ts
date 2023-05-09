import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  readonly crash: () => void;
}

export default TurboModuleRegistry.get<Spec>('NativeSampleModule');
