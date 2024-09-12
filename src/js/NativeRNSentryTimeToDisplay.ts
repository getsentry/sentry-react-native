import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

// There has to be only one interface and it has to be named `Spec`
// Only extra allowed definitions are types (probably codegen bug)
export interface Spec extends TurboModule {
  requestAnimationFrame(): Promise<number>;
}

// The export must be here to pass codegen even if not used
export default TurboModuleRegistry.getEnforcing<Spec>('RNSentryTimeToDisplay');
