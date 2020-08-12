const getTestProps = (id: string, platform: 'ios' | 'android') => ({
  accessibilityLabel: platform === 'android' ? id : undefined,
  accessible: true,
  testID: platform === 'ios' ? id : undefined,
});

export {getTestProps};
