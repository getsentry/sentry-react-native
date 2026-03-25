import { LogBox } from 'react-native';

import { ignoreRequireCycleLogs } from '../../src/js/utils/ignorerequirecyclelogs';

jest.mock('react-native', () => ({
  LogBox: {
    ignoreLogs: jest.fn(),
  },
}));

describe('ignoreRequireCycleLogs', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore logs for React Native version < 0.70', () => {
    ignoreRequireCycleLogs({ major: 0, minor: 69 });
    expect(LogBox.ignoreLogs).toHaveBeenCalledWith(['Require cycle:']);
  });

  it('should not ignore logs for React Native version 0.70', () => {
    ignoreRequireCycleLogs({ major: 0, minor: 70 });
    expect(LogBox.ignoreLogs).not.toHaveBeenCalled();
  });

  it('should not ignore logs for React Native version > 0.70', () => {
    ignoreRequireCycleLogs({ major: 0, minor: 71 });
    expect(LogBox.ignoreLogs).not.toHaveBeenCalled();
  });

  it('should not ignore logs when no version is passed', () => {
    ignoreRequireCycleLogs();
    expect(LogBox.ignoreLogs).not.toHaveBeenCalled();
  });
});
