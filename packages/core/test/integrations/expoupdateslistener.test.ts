import { addBreadcrumb, getCurrentScope, getGlobalScope, getIsolationScope } from '@sentry/core';

import { expoUpdatesListenerIntegration, handleStateChange } from '../../src/js/integrations/expoupdateslistener';
import * as environment from '../../src/js/utils/environment';
import { setupTestClient } from '../mocks/client';

jest.mock('../../src/js/wrapper', () => jest.requireActual('../mockWrapper'));
jest.mock('@sentry/core', () => {
  const actual = jest.requireActual('@sentry/core');
  return {
    ...actual,
    addBreadcrumb: jest.fn(),
  };
});

const mockRemove = jest.fn();
const mockAddListener = jest.fn().mockReturnValue({ remove: mockRemove });
const mockLatestContext = {
  isChecking: false,
  isDownloading: false,
  isUpdateAvailable: false,
  isUpdatePending: false,
  isRestarting: false,
};
const mockExpoUpdates = {
  addUpdatesStateChangeListener: mockAddListener,
  latestContext: mockLatestContext,
};
jest.mock('expo-updates', () => mockExpoUpdates, { virtual: true });

const mockAddBreadcrumb = addBreadcrumb as jest.MockedFunction<typeof addBreadcrumb>;

describe('ExpoUpdatesListener Integration', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();

    // Reset latestContext to default idle state
    mockExpoUpdates.latestContext = {
      isChecking: false,
      isDownloading: false,
      isUpdateAvailable: false,
      isUpdatePending: false,
      isRestarting: false,
    };

    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();
  });

  describe('setup', () => {
    it('subscribes to state changes when expo-updates is available', () => {
      jest.spyOn(environment, 'isExpo').mockReturnValue(true);
      jest.spyOn(environment, 'isExpoGo').mockReturnValue(false);

      setupTestClient({ enableNative: true, integrations: [expoUpdatesListenerIntegration()] });

      expect(mockAddListener).toHaveBeenCalledTimes(1);
      expect(mockAddListener).toHaveBeenCalledWith(expect.any(Function));
    });

    it('removes subscription on client close', () => {
      jest.spyOn(environment, 'isExpo').mockReturnValue(true);
      jest.spyOn(environment, 'isExpoGo').mockReturnValue(false);

      const client = setupTestClient({ enableNative: true, integrations: [expoUpdatesListenerIntegration()] });

      expect(mockRemove).not.toHaveBeenCalled();

      // @ts-expect-error emit is not typed for 'close' on TestClient
      client.emit('close');

      expect(mockRemove).toHaveBeenCalledTimes(1);
    });

    it('removes previous subscription when setup is called again', () => {
      jest.spyOn(environment, 'isExpo').mockReturnValue(true);
      jest.spyOn(environment, 'isExpoGo').mockReturnValue(false);

      const mockRemove1 = jest.fn();
      const mockRemove2 = jest.fn();
      mockAddListener.mockReturnValueOnce({ remove: mockRemove1 }).mockReturnValueOnce({ remove: mockRemove2 });

      const integration = expoUpdatesListenerIntegration();
      setupTestClient({ enableNative: true, integrations: [integration] });

      expect(mockAddListener).toHaveBeenCalledTimes(1);
      expect(mockRemove1).not.toHaveBeenCalled();

      // Simulate a second Sentry.init() reusing the same integration instance
      const client2 = setupTestClient({ enableNative: true, integrations: [integration] });

      expect(mockAddListener).toHaveBeenCalledTimes(2);
      expect(mockRemove1).toHaveBeenCalledTimes(1);
      expect(mockRemove2).not.toHaveBeenCalled();

      // @ts-expect-error emit is not typed for 'close' on TestClient
      client2.emit('close');

      expect(mockRemove2).toHaveBeenCalledTimes(1);
    });

    it('seeds previousContext from latestContext to avoid spurious breadcrumbs', () => {
      jest.spyOn(environment, 'isExpo').mockReturnValue(true);
      jest.spyOn(environment, 'isExpoGo').mockReturnValue(false);

      // Simulate an update already pending before Sentry.init()
      mockExpoUpdates.latestContext = {
        isChecking: false,
        isDownloading: false,
        isUpdateAvailable: true,
        isUpdatePending: true,
        isRestarting: false,
        latestManifest: { id: 'pre-existing-123' },
        downloadedManifest: { id: 'pre-existing-123' },
      };

      let capturedListener: ((event: { context: Record<string, unknown> }) => void) | undefined;
      mockAddListener.mockImplementation((listener: (event: { context: Record<string, unknown> }) => void) => {
        capturedListener = listener;
        return { remove: jest.fn() };
      });

      setupTestClient({ enableNative: true, integrations: [expoUpdatesListenerIntegration()] });

      // First event repeats the same state — should NOT produce breadcrumbs
      capturedListener!({
        context: {
          isChecking: false,
          isDownloading: false,
          isUpdateAvailable: true,
          isUpdatePending: true,
          isRestarting: false,
          latestManifest: { id: 'pre-existing-123' },
          downloadedManifest: { id: 'pre-existing-123' },
        },
      });

      expect(mockAddBreadcrumb).not.toHaveBeenCalled();
    });

    it('emits breadcrumb for new transitions after seeded state', () => {
      jest.spyOn(environment, 'isExpo').mockReturnValue(true);
      jest.spyOn(environment, 'isExpoGo').mockReturnValue(false);

      // Simulate an idle state before Sentry.init()
      mockExpoUpdates.latestContext = {
        isChecking: false,
        isDownloading: false,
        isUpdateAvailable: false,
        isUpdatePending: false,
        isRestarting: false,
      };

      let capturedListener: ((event: { context: Record<string, unknown> }) => void) | undefined;
      mockAddListener.mockImplementation((listener: (event: { context: Record<string, unknown> }) => void) => {
        capturedListener = listener;
        return { remove: jest.fn() };
      });

      setupTestClient({ enableNative: true, integrations: [expoUpdatesListenerIntegration()] });

      // A genuine new transition should still produce a breadcrumb
      capturedListener!({
        context: {
          isChecking: true,
          isDownloading: false,
          isUpdateAvailable: false,
          isUpdatePending: false,
          isRestarting: false,
        },
      });

      expect(mockAddBreadcrumb).toHaveBeenCalledTimes(1);
      expect(mockAddBreadcrumb).toHaveBeenCalledWith(expect.objectContaining({ message: 'Checking for update' }));
    });

    it('does not subscribe when not expo', () => {
      jest.spyOn(environment, 'isExpo').mockReturnValue(false);
      jest.spyOn(environment, 'isExpoGo').mockReturnValue(false);

      setupTestClient({ enableNative: true, integrations: [expoUpdatesListenerIntegration()] });

      expect(mockAddListener).not.toHaveBeenCalled();
    });

    it('does not subscribe when in Expo Go', () => {
      jest.spyOn(environment, 'isExpo').mockReturnValue(true);
      jest.spyOn(environment, 'isExpoGo').mockReturnValue(true);

      setupTestClient({ enableNative: true, integrations: [expoUpdatesListenerIntegration()] });

      expect(mockAddListener).not.toHaveBeenCalled();
    });
  });

  describe('handleStateChange', () => {
    const baseContext = {
      isChecking: false,
      isDownloading: false,
      isUpdateAvailable: false,
      isUpdatePending: false,
      isRestarting: false,
    };

    beforeEach(() => {
      mockAddBreadcrumb.mockClear();
    });

    it('adds breadcrumb when checking starts', () => {
      handleStateChange({ ...baseContext }, { ...baseContext, isChecking: true });

      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        category: 'expo.updates',
        message: 'Checking for update',
        level: 'info',
      });
    });

    it('does not add breadcrumb when checking stays true', () => {
      handleStateChange({ ...baseContext, isChecking: true }, { ...baseContext, isChecking: true });

      expect(mockAddBreadcrumb).not.toHaveBeenCalled();
    });

    it('adds breadcrumb when update becomes available', () => {
      handleStateChange(
        { ...baseContext },
        {
          ...baseContext,
          isUpdateAvailable: true,
          latestManifest: { id: 'abc-123' },
        },
      );

      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        category: 'expo.updates',
        message: 'Update available',
        level: 'info',
        data: { updateId: 'abc-123' },
      });
    });

    it('adds breadcrumb when update available without manifest id', () => {
      handleStateChange(
        { ...baseContext },
        {
          ...baseContext,
          isUpdateAvailable: true,
        },
      );

      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        category: 'expo.updates',
        message: 'Update available',
        level: 'info',
        data: undefined,
      });
    });

    it('adds breadcrumb when downloading starts', () => {
      handleStateChange({ ...baseContext }, { ...baseContext, isDownloading: true });

      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        category: 'expo.updates',
        message: 'Downloading update',
        level: 'info',
      });
    });

    it('adds breadcrumb when update is downloaded and pending', () => {
      handleStateChange(
        { ...baseContext },
        {
          ...baseContext,
          isUpdatePending: true,
          downloadedManifest: { id: 'def-456' },
        },
      );

      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        category: 'expo.updates',
        message: 'Update downloaded',
        level: 'info',
        data: { updateId: 'def-456' },
      });
    });

    it('adds breadcrumb when check error occurs', () => {
      handleStateChange(
        { ...baseContext },
        {
          ...baseContext,
          checkError: new Error('Network request failed'),
        },
      );

      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        category: 'expo.updates',
        message: 'Update check failed',
        level: 'error',
        data: { error: 'Network request failed' },
      });
    });

    it('adds breadcrumb when download error occurs', () => {
      handleStateChange(
        { ...baseContext },
        {
          ...baseContext,
          downloadError: new Error('Insufficient storage'),
        },
      );

      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        category: 'expo.updates',
        message: 'Update download failed',
        level: 'error',
        data: { error: 'Insufficient storage' },
      });
    });

    it('adds breadcrumb when rollback is received', () => {
      handleStateChange(
        { ...baseContext },
        {
          ...baseContext,
          rollback: { commitTime: '2025-03-01T00:00:00.000Z' },
        },
      );

      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        category: 'expo.updates',
        message: 'Rollback directive received',
        level: 'warning',
        data: { commitTime: '2025-03-01T00:00:00.000Z' },
      });
    });

    it('adds breadcrumb when restarting starts', () => {
      handleStateChange({ ...baseContext }, { ...baseContext, isRestarting: true });

      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        category: 'expo.updates',
        message: 'Restarting for update',
        level: 'info',
      });
    });

    it('adds multiple breadcrumbs for multiple transitions', () => {
      handleStateChange(
        { ...baseContext },
        {
          ...baseContext,
          isChecking: true,
          isDownloading: true,
        },
      );

      expect(mockAddBreadcrumb).toHaveBeenCalledTimes(2);
      expect(mockAddBreadcrumb).toHaveBeenCalledWith(expect.objectContaining({ message: 'Checking for update' }));
      expect(mockAddBreadcrumb).toHaveBeenCalledWith(expect.objectContaining({ message: 'Downloading update' }));
    });

    it('does not add breadcrumbs when nothing changes', () => {
      handleStateChange({ ...baseContext }, { ...baseContext });

      expect(mockAddBreadcrumb).not.toHaveBeenCalled();
    });

    it('does not re-emit breadcrumbs for already-present errors', () => {
      const existingError = new Error('Old error');
      handleStateChange({ ...baseContext, checkError: existingError }, { ...baseContext, checkError: existingError });

      expect(mockAddBreadcrumb).not.toHaveBeenCalled();
    });

    it('uses String fallback when error has no message', () => {
      const errorWithoutMessage = { toString: () => 'Custom error string' } as unknown as Error;
      handleStateChange(
        { ...baseContext },
        {
          ...baseContext,
          checkError: errorWithoutMessage,
        },
      );

      expect(mockAddBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { error: 'Custom error string' },
        }),
      );
    });
  });
});
