import { Platform } from 'react-native';

/**
 * Each platform uses different test ids There is a bug in Appium where accessibilityLabel does not work on iOS so we need testID,
 * and testID does not work on Android so we need accessibilityLabel,
 * @param id
 * @param platform
 */
const getTestProps = (
  id: string,
): {
  accessibilityLabel?: string;
  accessible?: boolean;
  testID?: string;
} =>
  Platform.OS === 'android'
    ? {
        accessibilityLabel: id,
        accessible: true,
      }
    : {
        testID: id,
      };

export { getTestProps };
