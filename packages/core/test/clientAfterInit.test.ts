import { ReactNativeClient } from '../src/js';
import type { ReactNativeClientOptions } from '../src/js/options';
import { NATIVE } from './mockWrapper';

jest.useFakeTimers({ advanceTimers: true });

jest.mock('../src/js/wrapper', () => jest.requireActual('./mockWrapper'));

describe('ReactNativeClient emits `afterInit` event', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('emits `afterInit` event when native is enabled', async () => {
    const client = setupReactNativeClient({
      enableNative: true,
    });

    const emitSpy = jest.spyOn(client, 'emit');
    client.init();

    await jest.runOnlyPendingTimersAsync();

    expect(emitSpy).toHaveBeenCalledWith('afterInit');
  });

  test('emits `afterInit` event when native is disabled', async () => {
    const client = setupReactNativeClient({
      enableNative: false,
    });

    const emitSpy = jest.spyOn(client, 'emit');
    client.init();

    await jest.runOnlyPendingTimersAsync();
    expect(emitSpy).toHaveBeenCalledWith('afterInit');
  });

  test('emits `afterInit` event when native init is rejected', async () => {
    NATIVE.initNativeSdk = jest.fn().mockRejectedValue(new Error('Test Native Init Rejected'));

    const client = setupReactNativeClient({
      enableNative: false,
    });

    const emitSpy = jest.spyOn(client, 'emit');
    client.init();

    await jest.runOnlyPendingTimersAsync();
    expect(emitSpy).toHaveBeenCalledWith('afterInit');
  });
});

function setupReactNativeClient(options: Partial<ReactNativeClientOptions> = {}): ReactNativeClient {
  return new ReactNativeClient({
    ...DEFAULT_OPTIONS,
    ...options,
  });
}

const EXAMPLE_DSN = 'https://6890c2f6677340daa4804f8194804ea2@o19635.ingest.sentry.io/148053';

const DEFAULT_OPTIONS: ReactNativeClientOptions = {
  dsn: EXAMPLE_DSN,
  enableNative: true,
  enableNativeCrashHandling: true,
  enableNativeNagger: true,
  autoInitializeNativeSdk: true,
  enableAutoPerformanceTracing: true,
  enableWatchdogTerminationTracking: true,
  patchGlobalPromise: true,
  integrations: [],
  transport: () => ({
    send: jest.fn(),
    flush: jest.fn(),
  }),
  stackParser: jest.fn().mockReturnValue([]),
};
