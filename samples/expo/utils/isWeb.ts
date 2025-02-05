import { Platform } from 'react-native';

export function isWeb(): boolean {
  return Platform.OS === 'web';
}
