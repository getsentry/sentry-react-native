import type { Event, SpanJSON } from '@sentry/core';

import * as mockWrapper from '../mockWrapper';
jest.mock('../../src/js/wrapper', () => mockWrapper);
import { NATIVE } from '../../src/js/wrapper';
import * as mockedtimetodisplaynative from './mockedtimetodisplaynative';
jest.mock('../../src/js/tracing/timetodisplaynative', () => mockedtimetodisplaynative);

import { timeToDisplayIntegration } from '../../src/js/tracing/integrations/timeToDisplayIntegration';
import { UI_LOAD_FULL_DISPLAY, UI_LOAD_INITIAL_DISPLAY } from '../../src/js/tracing/ops';

const ROOT_SPAN_ID = 'root0000000000000';
const TRACE_ID = 'trace000000000000000000000000000';
const TRANSACTION_START = 1_700_000_000;

/** Minimal finished transaction event as produced by `@sentry/core` before RN event processors run. */
function transactionEvent({ end }: { end: number }): Event {
  return {
    type: 'transaction',
    start_timestamp: TRANSACTION_START,
    timestamp: end,
    contexts: {
      trace: {
        span_id: ROOT_SPAN_ID,
        trace_id: TRACE_ID,
        op: 'navigation',
      },
    },
    spans: [],
    measurements: {},
  };
}

/** Fields Relay requires on every child span. */
function relayRequiredMissing(span: SpanJSON): string[] {
  const missing: string[] = [];
  if (!span.span_id) missing.push('span_id');
  if (!span.trace_id) missing.push('trace_id');
  if (!Number.isFinite(span.start_timestamp)) missing.push('start_timestamp');
  if (!Number.isFinite(span.timestamp as number)) missing.push('timestamp');
  return missing;
}

const findSpan = (event: Event | null, op: string): SpanJSON | undefined => event?.spans?.find(s => s.op === op);

async function processEvent(event: Event): Promise<Event | null> {
  const integration = timeToDisplayIntegration();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return integration.processEvent!(event, {}, {} as any);
}

describe('timeToDisplayIntegration', () => {
  beforeEach(() => {
    (NATIVE.popTimeToDisplayFor as jest.Mock).mockReset().mockResolvedValue(null);
  });

  describe('auto TTID reconstruction stays within transaction bounds (#6597)', () => {
    it('clamps a deadline-exceeded auto-TTID span to the transaction end', async () => {
      // Native TTID draw lands 40s after the transaction start (> 30s deadline),
      // but the transaction itself ended immediately (e.g. backgrounded).
      const transactionEnd = TRANSACTION_START + 0.5;
      const lateDraw = TRANSACTION_START + 40;
      (NATIVE.popTimeToDisplayFor as jest.Mock).mockImplementation((key: string) =>
        Promise.resolve(key === `ttid-navigation-${ROOT_SPAN_ID}` ? lateDraw : null),
      );

      const event = await processEvent(transactionEvent({ end: transactionEnd }));

      const ttid = findSpan(event, UI_LOAD_INITIAL_DISPLAY);
      expect(ttid).toBeDefined();
      expect(ttid!.status).toBe('deadline_exceeded');
      // The transaction end must NOT be inflated by the >30s deadline-exceeded child.
      expect(event!.timestamp).toBe(transactionEnd);
      // Regression: the child must not end after the transaction end, otherwise
      // Relay rejects the whole transaction as `invalid_transaction`.
      expect(ttid!.timestamp as number).toBeLessThanOrEqual(event!.timestamp as number);
      expect(ttid!.timestamp).toBe(transactionEnd);
      expect(relayRequiredMissing(ttid!)).toEqual([]);
    });

    it('clamps a deadline-exceeded auto-TTFD span to the transaction end', async () => {
      const transactionEnd = TRANSACTION_START + 0.5;
      (NATIVE.popTimeToDisplayFor as jest.Mock).mockImplementation((key: string) => {
        if (key === `ttid-navigation-${ROOT_SPAN_ID}`) return Promise.resolve(TRANSACTION_START + 0.4);
        if (key === `ttfd-${ROOT_SPAN_ID}`) return Promise.resolve(TRANSACTION_START + 45);
        return Promise.resolve(null);
      });

      const event = await processEvent(transactionEvent({ end: transactionEnd }));

      const ttfd = findSpan(event, UI_LOAD_FULL_DISPLAY);
      expect(ttfd).toBeDefined();
      expect(ttfd!.status).toBe('deadline_exceeded');
      expect(event!.timestamp).toBe(transactionEnd);
      expect(ttfd!.timestamp as number).toBeLessThanOrEqual(event!.timestamp as number);
      expect(ttfd!.timestamp).toBe(transactionEnd);
      expect(relayRequiredMissing(ttfd!)).toEqual([]);
    });

    it('extends the transaction end for an on-time auto-TTID span (control)', async () => {
      const transactionEnd = TRANSACTION_START + 0.5;
      const onTimeDraw = TRANSACTION_START + 2;
      (NATIVE.popTimeToDisplayFor as jest.Mock).mockImplementation((key: string) =>
        Promise.resolve(key === `ttid-navigation-${ROOT_SPAN_ID}` ? onTimeDraw : null),
      );

      const event = await processEvent(transactionEvent({ end: transactionEnd }));

      const ttid = findSpan(event, UI_LOAD_INITIAL_DISPLAY);
      expect(ttid).toBeDefined();
      expect(ttid!.status).toBe('ok');
      // Within the deadline the transaction end is extended to cover the child,
      // so the child stays in bounds and the measurement is recorded.
      expect(event!.timestamp).toBe(onTimeDraw);
      expect(ttid!.timestamp as number).toBeLessThanOrEqual(event!.timestamp as number);
      expect(event!.measurements?.time_to_initial_display?.value).toBeCloseTo(2000);
    });
  });
});
