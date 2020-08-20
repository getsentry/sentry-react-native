/**
 * Each platform uses different test ids There is a bug in Appium where accessibilityLabel does not work on iOS so we need testID,
 * and testID does not work on Android so we need accessibilityLabel,
 * @param id
 * @param platform
 */
const getTestProps = (id: string, platform: 'ios' | 'android') =>
  platform === 'android'
    ? {
        accessibilityLabel: platform === 'android' ? id : undefined,
        accessible: true,
      }
    : {
        testID: platform === 'ios' ? id : undefined,
      };

export {getTestProps};
