import type { TransactionEvent } from '@sentry/core';

import { getCurrentScope, getGlobalScope, getIsolationScope } from '@sentry/core';

import { handleSpanLifecycle } from '../../src/js/integrations/expoupdateslistener';
import { SPAN_ORIGIN_AUTO_EXPO_UPDATES } from '../../src/js/tracing/origin';
import { setupTestClient } from '../mocks/client';

jest.mock('../../src/js/wrapper', () => jest.requireActual('../mockWrapper'));

// No @sentry/core mock — uses real startInactiveSpan to verify
// spans flow through the SDK pipeline as real transactions.

describe('ExpoUpdatesListener Integration (real spans)', () => {
  const baseContext = {
    isChecking: false,
    isDownloading: false,
    isUpdateAvailable: false,
    isUpdatePending: false,
    isRestarting: false,
  };

  afterEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();
  });

  it('check span produces a transaction with correct op, origin, and ok status', () => {
    const client = setupTestClient({ tracesSampleRate: 1.0 });

    const { checkSpan } = handleSpanLifecycle(
      { ...baseContext },
      { ...baseContext, isChecking: true },
      undefined,
      undefined,
    );

    handleSpanLifecycle(
      { ...baseContext, isChecking: true },
      { ...baseContext, isChecking: false, isUpdateAvailable: true, latestManifest: { id: 'update-abc' } },
      checkSpan,
      undefined,
    );

    const event = client.event as TransactionEvent | undefined;
    expect(event).toBeDefined();
    expect(event?.contexts?.trace?.op).toBe('app.update.check');
    expect(event?.contexts?.trace?.status).toBe('ok');
    expect(event?.contexts?.trace?.origin).toBe(SPAN_ORIGIN_AUTO_EXPO_UPDATES);
    expect(event?.contexts?.trace?.data?.['expo.update.id']).toBe('update-abc');
  });

  it('check span produces a transaction with error status on failure', () => {
    const client = setupTestClient({ tracesSampleRate: 1.0 });

    const { checkSpan } = handleSpanLifecycle(
      { ...baseContext },
      { ...baseContext, isChecking: true },
      undefined,
      undefined,
    );

    handleSpanLifecycle(
      { ...baseContext, isChecking: true },
      { ...baseContext, isChecking: false, checkError: new Error('Network failed') },
      checkSpan,
      undefined,
    );

    const event = client.event as TransactionEvent | undefined;
    expect(event).toBeDefined();
    expect(event?.contexts?.trace?.op).toBe('app.update.check');
    expect(event?.contexts?.trace?.status).toBe('Network failed');
  });

  it('download span produces a transaction with correct op and update id', () => {
    const client = setupTestClient({ tracesSampleRate: 1.0 });

    const { downloadSpan } = handleSpanLifecycle(
      { ...baseContext },
      { ...baseContext, isDownloading: true },
      undefined,
      undefined,
    );

    handleSpanLifecycle(
      { ...baseContext, isDownloading: true },
      { ...baseContext, isDownloading: false, isUpdatePending: true, downloadedManifest: { id: 'dl-xyz' } },
      undefined,
      downloadSpan,
    );

    const event = client.event as TransactionEvent | undefined;
    expect(event).toBeDefined();
    expect(event?.contexts?.trace?.op).toBe('app.update.download');
    expect(event?.contexts?.trace?.status).toBe('ok');
    expect(event?.contexts?.trace?.origin).toBe(SPAN_ORIGIN_AUTO_EXPO_UPDATES);
    expect(event?.contexts?.trace?.data?.['expo.update.id']).toBe('dl-xyz');
  });

  it('full check-then-download lifecycle produces two transactions', () => {
    const client = setupTestClient({ tracesSampleRate: 1.0 });

    // Start check
    let result = handleSpanLifecycle({ ...baseContext }, { ...baseContext, isChecking: true }, undefined, undefined);

    // End check with update available
    result = handleSpanLifecycle(
      { ...baseContext, isChecking: true },
      { ...baseContext, isUpdateAvailable: true, latestManifest: { id: 'u-1' } },
      result.checkSpan,
      result.downloadSpan,
    );

    const checkEvent = client.eventQueue[0] as TransactionEvent | undefined;
    expect(checkEvent?.contexts?.trace?.op).toBe('app.update.check');

    // Start download
    result = handleSpanLifecycle(
      { ...baseContext, isUpdateAvailable: true },
      { ...baseContext, isUpdateAvailable: true, isDownloading: true },
      result.checkSpan,
      result.downloadSpan,
    );

    // End download
    handleSpanLifecycle(
      { ...baseContext, isUpdateAvailable: true, isDownloading: true },
      { ...baseContext, isUpdateAvailable: true, isUpdatePending: true, downloadedManifest: { id: 'u-1' } },
      result.checkSpan,
      result.downloadSpan,
    );

    expect(client.eventQueue).toHaveLength(2);

    const downloadEvent = client.eventQueue[1] as TransactionEvent | undefined;
    expect(downloadEvent?.contexts?.trace?.op).toBe('app.update.download');
    expect(downloadEvent?.contexts?.trace?.status).toBe('ok');
  });
});
