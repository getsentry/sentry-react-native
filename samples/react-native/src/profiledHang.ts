import * as Sentry from '@sentry/react-native';
import type { Attachment } from '@sentry/core';
import { startProfiling, stopProfiling } from '@sentry/react-native/dist/js/profiling/integration';
import { getDebugMetadata } from '@sentry/react-native/dist/js/profiling/debugid';
import { createHangFlamegraph } from './hangFlamegraph';

function calculateHangWork(seed: number): number {
  let result = seed;
  for (let i = 0; i < 10000; i++) {
    result = Math.sin(result + i);
  }
  return result;
}

function blockJavaScriptThread(): number {
  const start = performance.now();
  let result = 0;
  while (performance.now() - start < 1000) {
    result = calculateHangWork(result);
  }
  // Keep the work observable so an optimizing engine cannot discard it.
  console.log('Profiled hang workload result:', result);
  return performance.now() - start;
}

/** Profiles a short, intentional JS hang and captures its call trees with the event. */
export function captureProfiledHang(): string {
  // The public profiler controls sessions but does not expose samples. Use the SDK's
  // internal sampling API in this sample only, without starting native profilers.
  const start = startProfiling(false);
  if (start === null) {
    throw new Error('Hermes profiler unavailable or busy. Wait for tracing to finish and retry.');
  }

  const timestamp = Date.now() / 1000;
  let durationMs: number;
  let collected: ReturnType<typeof stopProfiling>;
  try {
    durationMs = blockJavaScriptThread();
  } finally {
    collected = stopProfiling(start);
  }
  if (!collected) {
    throw new Error('The Hermes profiler returned no samples. Run this example with Hermes enabled.');
  }
  const profile = 'js_profile' in collected ? collected.js_profile : collected.profile;
  const activeThreadId = 'js_profile' in collected
    ? collected.active_thread_id
    : collected.transaction.active_thread_id;
  const graph = createHangFlamegraph(profile, activeThreadId);
  if (!graph) {
    throw new Error('The Hermes profile has no sampled stacks.');
  }
  const data = JSON.stringify({ ...graph, debug_meta: { images: getDebugMetadata() } });
  // The wire contract limits the UTF-8 payload, not its UTF-16 string length.
  if (new TextEncoder().encode(data).length > 10 * 1024 * 1024) {
    throw new Error('The flame graph exceeds the 10 MiB attachment limit.');
  }

  return Sentry.captureEvent({
    level: durationMs > 500 ? 'error' : 'warning',
    timestamp,
    exception: {
      values: [{
        type: 'JavaScriptHang',
        value: `JavaScript engine blocked for ${Math.round(durationMs)} ms`,
        mechanism: { type: 'sample_js_hang', handled: true, synthetic: true },
        thread_id: activeThreadId,
      }],
    },
    contexts: { app_hang: { duration: durationMs / 1000 } },
    tags: { 'sample.profiled_hang': 'true' },
  }, {
    attachments: [{
      filename: 'flamegraph.json',
      contentType: 'application/json',
      attachmentType: 'event.flamegraph' as Attachment['attachmentType'],
      data,
    }],
  });
}
