import {
  addBreadcrumb,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  type Span,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  startInactiveSpan,
} from '@sentry/core';

import {
  expoUpdatesListenerIntegration,
  handleSpanLifecycle,
  handleStateChange,
} from '../../src/js/integrations/expoupdateslistener';
import { SPAN_ORIGIN_AUTO_EXPO_UPDATES } from '../../src/js/tracing/origin';
import * as environment from '../../src/js/utils/environment';
import { setupTestClient } from '../mocks/client';

jest.mock('../../src/js/wrapper', () => jest.requireActual('../mockWrapper'));
jest.mock('@sentry/core', () => {
  const actual = jest.requireActual('@sentry/core');
  return {
    ...actual,
    addBreadcrumb: jest.fn(),
    startInactiveSpan: jest.fn().mockReturnValue({
      setStatus: jest.fn(),
      setAttribute: jest.fn(),
      end: jest.fn(),
    }),
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
const mockStartInactiveSpan = startInactiveSpan as jest.MockedFunction<typeof startInactiveSpan>;

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

    it('ends in-progress spans on client close', () => {
      jest.spyOn(environment, 'isExpo').mockReturnValue(true);
      jest.spyOn(environment, 'isExpoGo').mockReturnValue(false);

      const mockSpan = { setStatus: jest.fn(), setAttribute: jest.fn(), end: jest.fn() };
      mockStartInactiveSpan.mockReturnValueOnce(mockSpan as unknown as Span);

      let capturedListener: ((event: { context: Record<string, unknown> }) => void) | undefined;
      mockAddListener.mockImplementation((listener: (event: { context: Record<string, unknown> }) => void) => {
        capturedListener = listener;
        return { remove: jest.fn() };
      });

      const client = setupTestClient({ enableNative: true, integrations: [expoUpdatesListenerIntegration()] });

      // Start a check (creates a span)
      capturedListener!({
        context: { ...mockLatestContext, isChecking: true },
      });
      expect(mockSpan.end).not.toHaveBeenCalled();

      // Close the client — span should be ended as cancelled
      // @ts-expect-error emit is not typed for 'close' on TestClient
      client.emit('close');

      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SPAN_STATUS_ERROR, message: 'cancelled' });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('ends in-progress spans on re-init', () => {
      jest.spyOn(environment, 'isExpo').mockReturnValue(true);
      jest.spyOn(environment, 'isExpoGo').mockReturnValue(false);

      const mockSpan = { setStatus: jest.fn(), setAttribute: jest.fn(), end: jest.fn() };
      mockStartInactiveSpan.mockReturnValueOnce(mockSpan as unknown as Span);

      let capturedListener: ((event: { context: Record<string, unknown> }) => void) | undefined;
      mockAddListener.mockImplementation((listener: (event: { context: Record<string, unknown> }) => void) => {
        capturedListener = listener;
        return { remove: jest.fn() };
      });

      const integration = expoUpdatesListenerIntegration();
      setupTestClient({ enableNative: true, integrations: [integration] });

      // Start a check (creates a span)
      capturedListener!({
        context: { ...mockLatestContext, isChecking: true },
      });
      expect(mockSpan.end).not.toHaveBeenCalled();

      // Re-init — old span should be ended as cancelled
      setupTestClient({ enableNative: true, integrations: [integration] });

      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SPAN_STATUS_ERROR, message: 'cancelled' });
      expect(mockSpan.end).toHaveBeenCalled();
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

  describe('handleSpanLifecycle', () => {
    const baseContext = {
      isChecking: false,
      isDownloading: false,
      isUpdateAvailable: false,
      isUpdatePending: false,
      isRestarting: false,
    };

    beforeEach(() => {
      mockStartInactiveSpan.mockClear();
    });

    it('starts a check span when isChecking transitions to true', () => {
      const mockSpan = { setStatus: jest.fn(), setAttribute: jest.fn(), end: jest.fn() };
      mockStartInactiveSpan.mockReturnValueOnce(mockSpan as unknown as Span);

      const result = handleSpanLifecycle(
        { ...baseContext },
        { ...baseContext, isChecking: true },
        undefined,
        undefined,
      );

      expect(mockStartInactiveSpan).toHaveBeenCalledWith({
        name: 'expo-updates check',
        op: 'app.update.check',
        forceTransaction: true,
        attributes: { 'sentry.origin': SPAN_ORIGIN_AUTO_EXPO_UPDATES },
      });
      expect(result.checkSpan).toBe(mockSpan);
    });

    it('ends check span with ok status when check succeeds with update available', () => {
      const mockSpan = { setStatus: jest.fn(), setAttribute: jest.fn(), end: jest.fn() };

      handleSpanLifecycle(
        { ...baseContext, isChecking: true },
        { ...baseContext, isChecking: false, isUpdateAvailable: true, latestManifest: { id: 'update-123' } },
        mockSpan as unknown as Span,
        undefined,
      );

      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SPAN_STATUS_OK });
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('expo.update.id', 'update-123');
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('ends check span with ok status when no update available', () => {
      const mockSpan = { setStatus: jest.fn(), setAttribute: jest.fn(), end: jest.fn() };

      const result = handleSpanLifecycle(
        { ...baseContext, isChecking: true },
        { ...baseContext, isChecking: false, isUpdateAvailable: false },
        mockSpan as unknown as Span,
        undefined,
      );

      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SPAN_STATUS_OK });
      expect(mockSpan.setAttribute).not.toHaveBeenCalled();
      expect(mockSpan.end).toHaveBeenCalled();
      expect(result.checkSpan).toBeUndefined();
    });

    it('ends check span with error status on check error', () => {
      const mockSpan = { setStatus: jest.fn(), setAttribute: jest.fn(), end: jest.fn() };

      handleSpanLifecycle(
        { ...baseContext, isChecking: true },
        { ...baseContext, isChecking: false, checkError: new Error('Network failed') },
        mockSpan as unknown as Span,
        undefined,
      );

      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SPAN_STATUS_ERROR, message: 'Network failed' });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('starts a download span when isDownloading transitions to true', () => {
      const mockSpan = { setStatus: jest.fn(), setAttribute: jest.fn(), end: jest.fn() };
      mockStartInactiveSpan.mockReturnValueOnce(mockSpan as unknown as Span);

      const result = handleSpanLifecycle(
        { ...baseContext },
        { ...baseContext, isDownloading: true },
        undefined,
        undefined,
      );

      expect(mockStartInactiveSpan).toHaveBeenCalledWith({
        name: 'expo-updates download',
        op: 'app.update.download',
        forceTransaction: true,
        attributes: { 'sentry.origin': SPAN_ORIGIN_AUTO_EXPO_UPDATES },
      });
      expect(result.downloadSpan).toBe(mockSpan);
    });

    it('ends download span with ok status when download succeeds', () => {
      const mockSpan = { setStatus: jest.fn(), setAttribute: jest.fn(), end: jest.fn() };

      handleSpanLifecycle(
        { ...baseContext, isDownloading: true },
        { ...baseContext, isDownloading: false, isUpdatePending: true, downloadedManifest: { id: 'dl-456' } },
        undefined,
        mockSpan as unknown as Span,
      );

      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SPAN_STATUS_OK });
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('expo.update.id', 'dl-456');
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('ends download span with error status on download error', () => {
      const mockSpan = { setStatus: jest.fn(), setAttribute: jest.fn(), end: jest.fn() };

      handleSpanLifecycle(
        { ...baseContext, isDownloading: true },
        { ...baseContext, isDownloading: false, downloadError: new Error('Insufficient storage') },
        undefined,
        mockSpan as unknown as Span,
      );

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SPAN_STATUS_ERROR,
        message: 'Insufficient storage',
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('does not start spans when fields stay the same', () => {
      handleSpanLifecycle({ ...baseContext }, { ...baseContext }, undefined, undefined);

      expect(mockStartInactiveSpan).not.toHaveBeenCalled();
    });

    it('does not end spans when isChecking stays true', () => {
      const mockSpan = { setStatus: jest.fn(), setAttribute: jest.fn(), end: jest.fn() };

      const result = handleSpanLifecycle(
        { ...baseContext, isChecking: true },
        { ...baseContext, isChecking: true },
        mockSpan as unknown as Span,
        undefined,
      );

      expect(mockSpan.end).not.toHaveBeenCalled();
      expect(result.checkSpan).toBe(mockSpan);
    });

    it('handles full check-then-download lifecycle', () => {
      const checkMockSpan = { setStatus: jest.fn(), setAttribute: jest.fn(), end: jest.fn() };
      const downloadMockSpan = { setStatus: jest.fn(), setAttribute: jest.fn(), end: jest.fn() };
      mockStartInactiveSpan
        .mockReturnValueOnce(checkMockSpan as unknown as Span)
        .mockReturnValueOnce(downloadMockSpan as unknown as Span);

      // Step 1: Start checking
      let result = handleSpanLifecycle({ ...baseContext }, { ...baseContext, isChecking: true }, undefined, undefined);
      expect(result.checkSpan).toBe(checkMockSpan);

      // Step 2: Check complete, update available
      result = handleSpanLifecycle(
        { ...baseContext, isChecking: true },
        { ...baseContext, isUpdateAvailable: true, latestManifest: { id: 'u-1' } },
        result.checkSpan,
        result.downloadSpan,
      );
      expect(checkMockSpan.end).toHaveBeenCalled();
      expect(result.checkSpan).toBeUndefined();

      // Step 3: Start downloading
      result = handleSpanLifecycle(
        { ...baseContext, isUpdateAvailable: true },
        { ...baseContext, isUpdateAvailable: true, isDownloading: true },
        result.checkSpan,
        result.downloadSpan,
      );
      expect(result.downloadSpan).toBe(downloadMockSpan);

      // Step 4: Download complete
      result = handleSpanLifecycle(
        { ...baseContext, isUpdateAvailable: true, isDownloading: true },
        { ...baseContext, isUpdateAvailable: true, isUpdatePending: true, downloadedManifest: { id: 'u-1' } },
        result.checkSpan,
        result.downloadSpan,
      );
      expect(downloadMockSpan.end).toHaveBeenCalled();
      expect(result.downloadSpan).toBeUndefined();
    });
  });
});
