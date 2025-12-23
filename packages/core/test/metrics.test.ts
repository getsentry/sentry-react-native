import { getClient, metrics, setCurrentClient } from '@sentry/core';
import { ReactNativeClient } from '../src/js';
import { mobileReplayIntegration } from '../src/js/replay/mobilereplay';
import { getDefaultTestClientOptions } from './mocks/client';
import { NATIVE } from './mockWrapper';

jest.mock('../src/js/wrapper', () => jest.requireActual('./mockWrapper'));

const EXAMPLE_DSN = 'https://6890c2f6677340daa4804f8194804ea2@o19635.ingest.sentry.io/148053';

describe('Metrics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (NATIVE.isNativeAvailable as jest.Mock).mockImplementation(() => true);
  });

  afterEach(() => {
    const client = getClient();
    client?.close();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('beforeSendMetric', () => {
    it('is called when enableMetrics is true and a metric is sent', async () => {
      const beforeSendMetric = jest.fn(metric => metric);

      const client = new ReactNativeClient({
        ...getDefaultTestClientOptions({
          dsn: EXAMPLE_DSN,
          enableMetrics: true,
          beforeSendMetric,
        }),
      });

      setCurrentClient(client);
      client.init();

      // Send a metric
      metrics.count('test_metric', 1);

      jest.advanceTimersByTime(10000);
      expect(beforeSendMetric).toHaveBeenCalled();
    });

    it('is not called when enableMetrics is false', async () => {
      const beforeSendMetric = jest.fn(metric => metric);

      const client = new ReactNativeClient({
        ...getDefaultTestClientOptions({
          dsn: EXAMPLE_DSN,
          enableMetrics: false,
          beforeSendMetric,
        }),
      });

      setCurrentClient(client);
      client.init();

      // Send a metric
      metrics.count('test_metric', 1);

      jest.advanceTimersByTime(10000);
      expect(beforeSendMetric).not.toHaveBeenCalled();
    });

    it('is called when enableMetrics is undefined (metrics are enabled by default)', async () => {
      const beforeSendMetric = jest.fn(metric => metric);

      const client = new ReactNativeClient({
        ...getDefaultTestClientOptions({
          dsn: EXAMPLE_DSN,
          beforeSendMetric,
        }),
      });

      setCurrentClient(client);
      client.init();

      // Send a metric
      metrics.count('test_metric', 1);

      jest.advanceTimersByTime(10000);
      expect(beforeSendMetric).toHaveBeenCalled();
    });

    it('allows beforeSendMetric to modify metrics when enableMetrics is true', async () => {
      const beforeSendMetric = jest.fn(metric => {
        // Modify the metric
        return { ...metric, name: 'modified_metric' };
      });

      const client = new ReactNativeClient({
        ...getDefaultTestClientOptions({
          dsn: EXAMPLE_DSN,
          enableMetrics: true,
          beforeSendMetric,
        }),
      });

      setCurrentClient(client);
      client.init();

      // Send a metric
      metrics.count('test_metric', 1);

      jest.advanceTimersByTime(10000);
      expect(beforeSendMetric).toHaveBeenCalled();
      const modifiedMetric = beforeSendMetric.mock.results[0]?.value;
      expect(modifiedMetric).toBeDefined();
      expect(modifiedMetric.name).toBe('modified_metric');
    });

    it('allows beforeSendMetric to drop metrics by returning null', async () => {
      const beforeSendMetric = jest.fn(() => null);

      const client = new ReactNativeClient({
        ...getDefaultTestClientOptions({
          dsn: EXAMPLE_DSN,
          enableMetrics: true,
          beforeSendMetric,
        }),
      });

      setCurrentClient(client);
      client.init();

      // Send a metric
      metrics.count('test_metric', 1);

      // Advance timers
      jest.advanceTimersByTime(10000);
      expect(beforeSendMetric).toHaveBeenCalled();
      expect(beforeSendMetric.mock.results[0]?.value).toBeNull();
    });
  });

  describe('metrics API', () => {
    it('metrics.count works when enableMetrics is true', () => {
      const client = new ReactNativeClient({
        ...getDefaultTestClientOptions({
          dsn: EXAMPLE_DSN,
          enableMetrics: true,
        }),
      });

      setCurrentClient(client);
      client.init();

      expect(() => {
        metrics.count('test_metric', 1);
      }).not.toThrow();
    });

    it('metrics can be sent with tags', async () => {
      const beforeSendMetric = jest.fn(metric => metric);

      const client = new ReactNativeClient({
        ...getDefaultTestClientOptions({
          dsn: EXAMPLE_DSN,
          enableMetrics: true,
          beforeSendMetric,
        }),
      });

      setCurrentClient(client);
      client.init();

      // Send a metric with tags
      metrics.count('test_metric', 1, {
        attributes: { environment: 'test' },
      });

      jest.advanceTimersByTime(10000);
      expect(beforeSendMetric).toHaveBeenCalled();
      const sentMetric = beforeSendMetric.mock.calls[0]?.[0];
      expect(sentMetric).toBeDefined();
    });

    it('metrics include replay_id when mobile replay integration is active', async () => {
      const mockReplayId = 'test-replay-id-123';
      (NATIVE.getCurrentReplayId as jest.Mock).mockReturnValue(mockReplayId);

      const beforeSendMetric = jest.fn(metric => metric);

      const client = new ReactNativeClient({
        ...getDefaultTestClientOptions({
          dsn: EXAMPLE_DSN,
          enableMetrics: true,
          beforeSendMetric,
          integrations: [mobileReplayIntegration()],
          replaysSessionSampleRate: 1.0,
        }),
      });

      setCurrentClient(client);
      client.init();

      // Send a metric
      metrics.count('test_metric', 1);

      jest.advanceTimersByTime(10000);
      expect(beforeSendMetric).toHaveBeenCalled();
      const sentMetric = beforeSendMetric.mock.calls[0]?.[0];
      expect(sentMetric).toBeDefined();
      expect(sentMetric.attributes).toBeDefined();
      expect(sentMetric.attributes?.replay_id).toBe(mockReplayId);
    });

    it('metrics do not include replay_id when replay integration is not active', async () => {
      (NATIVE.getCurrentReplayId as jest.Mock).mockReturnValue(null);

      const beforeSendMetric = jest.fn(metric => metric);

      const client = new ReactNativeClient({
        ...getDefaultTestClientOptions({
          dsn: EXAMPLE_DSN,
          enableMetrics: true,
          beforeSendMetric,
        }),
      });

      setCurrentClient(client);
      client.init();

      // Send a metric
      metrics.count('test_metric', 1);

      jest.advanceTimersByTime(10000);
      expect(beforeSendMetric).toHaveBeenCalled();
      const sentMetric = beforeSendMetric.mock.calls[0]?.[0];
      expect(sentMetric).toBeDefined();
      expect(sentMetric.attributes?.replay_id).toBeUndefined();
    });
  });
});
