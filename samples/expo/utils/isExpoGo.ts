import Constants, { AppOwnership } from 'expo-constants';

export function isExpoGo(): boolean {
  return Constants.appOwnership === AppOwnership.Expo;
}
