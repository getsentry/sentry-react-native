import { debug, setCurrentClient } from '@sentry/core';
import { render } from '@testing-library/react-native';
import * as React from 'react';
import { Text } from 'react-native';

import { resetFeedbackFormManager } from '../../src/js/feedback/FeedbackFormManager';
import { FeedbackFormProvider } from '../../src/js/feedback/FeedbackFormProvider';
import { feedbackIntegration } from '../../src/js/feedback/integration';
import { isShakeListenerActive, startShakeListener, stopShakeListener } from '../../src/js/feedback/ShakeToReportBug';
import { isModalSupported } from '../../src/js/feedback/utils';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

jest.mock('../../src/js/feedback/utils', () => ({
  isModalSupported: jest.fn(),
  isNativeDriverSupportedForColorAnimations: jest.fn().mockReturnValue(true),
}));

const mockedIsModalSupported = isModalSupported as jest.MockedFunction<typeof isModalSupported>;

jest.mock('../../src/js/wrapper', () => ({
  getRNSentryModule: jest.fn(() => ({
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  })),
}));

let mockShakeCallback: (() => void) | undefined;
const mockRemove = jest.fn();

const createMockEmitter = () => {
  return jest.fn().mockReturnValue({
    addListener: jest.fn().mockImplementation((_eventType: string, listener: () => void) => {
      mockShakeCallback = listener;
      return { remove: mockRemove };
    }),
  });
};

let mockEmitterFactory: ReturnType<typeof createMockEmitter>;

// Also mock the module-level NativeEventEmitter used by FeedbackFormProvider's auto-start
jest.mock('../../src/js/feedback/ShakeToReportBug', () => {
  const actual = jest.requireActual('../../src/js/feedback/ShakeToReportBug');
  return {
    ...actual,
    startShakeListener: jest.fn(actual.startShakeListener),
    stopShakeListener: jest.fn(actual.stopShakeListener),
    isShakeListenerActive: jest.fn(actual.isShakeListenerActive),
  };
});

beforeEach(() => {
  debug.error = jest.fn();
  debug.log = jest.fn() as typeof debug.log;
  debug.warn = jest.fn() as typeof debug.warn;
});

describe('ShakeToReportBug', () => {
  beforeEach(() => {
    const client = new TestClient(getDefaultTestClientOptions());
    setCurrentClient(client);
    client.init();
    resetFeedbackFormManager();

    // Get the actual functions (unmocked)
    const actual = jest.requireActual('../../src/js/feedback/ShakeToReportBug');
    actual.stopShakeListener();

    mockShakeCallback = undefined;
    mockRemove.mockClear();
    mockEmitterFactory = createMockEmitter();

    (startShakeListener as jest.Mock).mockClear();
    (stopShakeListener as jest.Mock).mockClear();
    (isShakeListenerActive as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('startShakeListener / stopShakeListener', () => {
    it('starts listening for shake events', () => {
      const actual = jest.requireActual('../../src/js/feedback/ShakeToReportBug');
      actual.startShakeListener(jest.fn(), mockEmitterFactory);

      expect(actual.isShakeListenerActive()).toBe(true);
      expect(mockEmitterFactory).toHaveBeenCalledTimes(1);
    });

    it('does not start a second listener if already active', () => {
      const actual = jest.requireActual('../../src/js/feedback/ShakeToReportBug');
      actual.startShakeListener(jest.fn(), mockEmitterFactory);
      actual.startShakeListener(jest.fn(), mockEmitterFactory);

      expect(actual.isShakeListenerActive()).toBe(true);
      expect(mockEmitterFactory).toHaveBeenCalledTimes(1);
    });

    it('stops listening for shake events', () => {
      const actual = jest.requireActual('../../src/js/feedback/ShakeToReportBug');
      actual.startShakeListener(jest.fn(), mockEmitterFactory);
      actual.stopShakeListener();

      expect(actual.isShakeListenerActive()).toBe(false);
      expect(mockRemove).toHaveBeenCalledTimes(1);
    });

    it('does not throw when stopping without starting', () => {
      const actual = jest.requireActual('../../src/js/feedback/ShakeToReportBug');
      expect(() => actual.stopShakeListener()).not.toThrow();
    });

    it('invokes onShake callback when shake event is received', () => {
      const actual = jest.requireActual('../../src/js/feedback/ShakeToReportBug');
      const onShake = jest.fn();
      actual.startShakeListener(onShake, mockEmitterFactory);

      mockShakeCallback?.();

      expect(onShake).toHaveBeenCalledTimes(1);
    });
  });

  describe('feedbackIntegration with enableShakeToReport', () => {
    it('auto-starts shake listener when enableShakeToReport is true', () => {
      mockedIsModalSupported.mockReturnValue(true);

      const integration = feedbackIntegration({
        enableShakeToReport: true,
      });

      const client = new TestClient(getDefaultTestClientOptions());
      setCurrentClient(client);
      client.init();
      client.addIntegration(integration);

      render(
        <FeedbackFormProvider>
          <Text>App Components</Text>
        </FeedbackFormProvider>,
      );

      expect(startShakeListener).toHaveBeenCalled();
    });

    it('does not auto-start shake listener when enableShakeToReport is false', () => {
      mockedIsModalSupported.mockReturnValue(true);

      const integration = feedbackIntegration({
        enableShakeToReport: false,
      });

      const client = new TestClient(getDefaultTestClientOptions());
      setCurrentClient(client);
      client.init();
      client.addIntegration(integration);

      render(
        <FeedbackFormProvider>
          <Text>App Components</Text>
        </FeedbackFormProvider>,
      );

      expect(startShakeListener).not.toHaveBeenCalled();
    });

    it('does not auto-start shake listener when enableShakeToReport is not set', () => {
      mockedIsModalSupported.mockReturnValue(true);

      const integration = feedbackIntegration();

      const client = new TestClient(getDefaultTestClientOptions());
      setCurrentClient(client);
      client.init();
      client.addIntegration(integration);

      render(
        <FeedbackFormProvider>
          <Text>App Components</Text>
        </FeedbackFormProvider>,
      );

      expect(startShakeListener).not.toHaveBeenCalled();
    });

    it('stops shake listener when FeedbackFormProvider unmounts', () => {
      mockedIsModalSupported.mockReturnValue(true);

      const integration = feedbackIntegration({
        enableShakeToReport: true,
      });

      const client = new TestClient(getDefaultTestClientOptions());
      setCurrentClient(client);
      client.init();
      client.addIntegration(integration);

      const { unmount } = render(
        <FeedbackFormProvider>
          <Text>App Components</Text>
        </FeedbackFormProvider>,
      );

      expect(startShakeListener).toHaveBeenCalled();

      unmount();

      expect(stopShakeListener).toHaveBeenCalled();
    });
  });
});
