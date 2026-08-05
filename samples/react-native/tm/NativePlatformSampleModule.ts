import {TurboModule, TurboModuleRegistry} from 'react-native';

export interface Spec extends TurboModule {
  crashOrString(): string;
  /** Asynchronous platform TurboModule call, used to exercise async TurboModule instrumentation. */
  getPlatform(): Promise<string>;
}

export default TurboModuleRegistry.get<Spec>('NativePlatformSampleModule');
