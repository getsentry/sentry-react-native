import {TurboModule, TurboModuleRegistry} from 'react-native';

export interface Spec extends TurboModule {
  crashOrString(): string;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativePlatformSampleModule');
