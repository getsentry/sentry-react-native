import type { Span } from '@sentry/core';

import {
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  setCurrentClient,
  spanToJSON,
  startSpanManual,
} from '@sentry/core';

import * as mockWrapper from '../mockWrapper';

jest.mock('../../src/js/wrapper', () => mockWrapper);

import * as mockedtimetodisplaynative from './mockedtimetodisplaynative';

jest.mock('../../src/js/tracing/timetodisplaynative', () => mockedtimetodisplaynative);

import { act, render } from '@testing-library/react-native';
import * as React from 'react';

import { _resetTimeToDisplayCoordinator } from '../../src/js/tracing/timeToDisplayCoordinator';
import { TimeToFullDisplay, TimeToInitialDisplay } from '../../src/js/tracing/timetodisplay';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';
import { secondAgoTimestampMs } from '../testutils';

jest.mock('../../src/js/utils/environment', () => ({
  isWeb: jest.fn().mockReturnValue(false),
  isTurboModuleEnabled: jest.fn().mockReturnValue(false),
}));

const { getMockedOnDrawReportedProps, clearMockedOnDrawReportedProps } = mockedtimetodisplaynative;

function tailHasFullDisplay(parentSpanId: string, mountedReporterCount: number): boolean {
  const props = getMockedOnDrawReportedProps().filter(p => p.parentSpanId === parentSpanId);
  const tail = props.slice(-mountedReporterCount);
  return tail.some(p => p.fullDisplay === true);
}

function tailHasInitialDisplay(parentSpanId: string, mountedReporterCount: number): boolean {
  const props = getMockedOnDrawReportedProps().filter(p => p.parentSpanId === parentSpanId);
  const tail = props.slice(-mountedReporterCount);
  return tail.some(p => p.initialDisplay === true);
}

jest.useFakeTimers({ advanceTimers: true, doNotFake: ['performance'] });

describe('TimeToDisplay multi-instance (`ready` prop)', () => {
  beforeEach(() => {
    clearMockedOnDrawReportedProps();
    _resetTimeToDisplayCoordinator();
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();
    const options = getDefaultTestClientOptions({ tracesSampleRate: 1.0 });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockWrapper.NATIVE.enableNative = true;
  });

  test('legacy: single `record` instance behaves identically to today', () => {
    startSpanManual({ name: 'Screen', startTime: secondAgoTimestampMs() }, (activeSpan: Span | undefined) => {
      const spanId = spanToJSON(activeSpan!).span_id;
      render(<TimeToFullDisplay record={true} />);
      expect(tailHasFullDisplay(spanId, 1)).toBe(true);
      activeSpan?.end();
    });
  });

  test('two `ready={false}` instances do not emit', () => {
    startSpanManual({ name: 'Screen', startTime: secondAgoTimestampMs() }, (activeSpan: Span | undefined) => {
      const spanId = spanToJSON(activeSpan!).span_id;
      render(
        <>
          <TimeToFullDisplay ready={false} />
          <TimeToFullDisplay ready={false} />
        </>,
      );
      expect(tailHasFullDisplay(spanId, 2)).toBe(false);
      activeSpan?.end();
    });
  });

  test('two `ready` instances emit only when both are ready', () => {
    startSpanManual({ name: 'Screen', startTime: secondAgoTimestampMs() }, (activeSpan: Span | undefined) => {
      const spanId = spanToJSON(activeSpan!).span_id;

      const Screen = ({ a, b }: { a: boolean; b: boolean }) => (
        <>
          <TimeToFullDisplay ready={a} />
          <TimeToFullDisplay ready={b} />
        </>
      );

      const tree = render(<Screen a={false} b={false} />);
      expect(tailHasFullDisplay(spanId, 2)).toBe(false);

      act(() => tree.rerender(<Screen a={true} b={false} />));
      expect(tailHasFullDisplay(spanId, 2)).toBe(false);

      act(() => tree.rerender(<Screen a={true} b={true} />));
      expect(tailHasFullDisplay(spanId, 2)).toBe(true);

      activeSpan?.end();
    });
  });

  test('late-mounting `ready={false}` un-readies an already-ready aggregate', () => {
    startSpanManual({ name: 'Screen', startTime: secondAgoTimestampMs() }, (activeSpan: Span | undefined) => {
      const spanId = spanToJSON(activeSpan!).span_id;

      const Screen = ({ showLate, lateReady }: { showLate: boolean; lateReady: boolean }) => (
        <>
          <TimeToFullDisplay ready={true} />
          {showLate ? <TimeToFullDisplay ready={lateReady} /> : null}
        </>
      );

      const tree = render(<Screen showLate={false} lateReady={false} />);
      expect(tailHasFullDisplay(spanId, 1)).toBe(true);

      act(() => tree.rerender(<Screen showLate={true} lateReady={false} />));
      expect(tailHasFullDisplay(spanId, 2)).toBe(false);

      act(() => tree.rerender(<Screen showLate={true} lateReady={true} />));
      expect(tailHasFullDisplay(spanId, 2)).toBe(true);

      activeSpan?.end();
    });
  });

  test('unmounting the sole blocker does NOT emit ready (sticky safeguard)', () => {
    // A conditionally-rendered loading section that disappears before its
    // data resolves must not trick TTFD into firing as if the screen were
    // fully displayed. The sole-blocker checkpoint is kept sticky in the
    // registry, so its unmount cannot flip the aggregate to true.
    startSpanManual({ name: 'Screen', startTime: secondAgoTimestampMs() }, (activeSpan: Span | undefined) => {
      const spanId = spanToJSON(activeSpan!).span_id;

      const Screen = ({ showBlocker }: { showBlocker: boolean }) => (
        <>
          <TimeToFullDisplay ready={true} />
          {showBlocker ? <TimeToFullDisplay ready={false} /> : null}
        </>
      );

      const tree = render(<Screen showBlocker={true} />);
      expect(tailHasFullDisplay(spanId, 2)).toBe(false);

      act(() => tree.rerender(<Screen showBlocker={false} />));
      expect(tailHasFullDisplay(spanId, 1)).toBe(false);

      activeSpan?.end();
    });
  });

  test('unmounting a non-sole-blocker resolves the aggregate when remaining peers are ready', () => {
    // The sticky safeguard only applies to *sole* blockers. If other
    // not-ready peers exist, an unmount can't flip the aggregate to true,
    // so it removes normally.
    startSpanManual({ name: 'Screen', startTime: secondAgoTimestampMs() }, (activeSpan: Span | undefined) => {
      const spanId = spanToJSON(activeSpan!).span_id;

      const Screen = ({ aReady, showB }: { aReady: boolean; showB: boolean }) => (
        <>
          <TimeToFullDisplay ready={aReady} />
          {showB ? <TimeToFullDisplay ready={false} /> : null}
        </>
      );

      const tree = render(<Screen aReady={false} showB={true} />);
      expect(tailHasFullDisplay(spanId, 2)).toBe(false);

      // Unmount B while A is also not-ready: not a sole-blocker case, B
      // removes normally; aggregate still blocked by A.
      act(() => tree.rerender(<Screen aReady={false} showB={false} />));
      expect(tailHasFullDisplay(spanId, 1)).toBe(false);

      // Now flip A to ready: aggregate flips, A's reporter emits.
      act(() => tree.rerender(<Screen aReady={true} showB={false} />));
      expect(tailHasFullDisplay(spanId, 1)).toBe(true);

      activeSpan?.end();
    });
  });

  test('mixed `record` + `ready`: legacy `record` is independent, `ready` peers coordinate', () => {
    // Backward compat: `record`-only instances do not register as checkpoints
    // and are not gated by `ready` peers. They emit `fullDisplay` directly
    // from their own prop, exactly as before this change. `ready` peers gate
    // each other via the registry.
    startSpanManual({ name: 'Screen', startTime: secondAgoTimestampMs() }, (activeSpan: Span | undefined) => {
      const spanId = spanToJSON(activeSpan!).span_id;

      const Screen = ({ rec, rdy }: { rec: boolean; rdy: boolean }) => (
        <>
          <TimeToFullDisplay record={rec} />
          <TimeToFullDisplay ready={rdy} />
        </>
      );

      // record=true fires independently; ready=false blocks the ready reporter.
      // The tail reflects: [record:true, ready:false] → fullDisplay=true present.
      const tree = render(<Screen rec={true} rdy={false} />);
      expect(tailHasFullDisplay(spanId, 2)).toBe(true);

      // record=false stops emitting; ready=true now fires.
      act(() => tree.rerender(<Screen rec={false} rdy={true} />));
      expect(tailHasFullDisplay(spanId, 2)).toBe(true);

      // Both fire.
      act(() => tree.rerender(<Screen rec={true} rdy={true} />));
      expect(tailHasFullDisplay(spanId, 2)).toBe(true);

      activeSpan?.end();
    });
  });

  test('legacy: bare <TimeToFullDisplay /> does not block `ready` peers', () => {
    // Backward compat for layout-placeholder usage. A bare component with
    // neither prop is a no-op (legacy `record=false`).
    startSpanManual({ name: 'Screen', startTime: secondAgoTimestampMs() }, (activeSpan: Span | undefined) => {
      const spanId = spanToJSON(activeSpan!).span_id;
      render(
        <>
          <TimeToFullDisplay />
          <TimeToFullDisplay ready={true} />
        </>,
      );
      expect(tailHasFullDisplay(spanId, 2)).toBe(true);
      activeSpan?.end();
    });
  });

  test('legacy: two `record` peers fire independently (no coordination)', () => {
    // Backward compat: pre-change behavior was last-write-wins on the native
    // side. record-only peers must continue to fire independently.
    startSpanManual({ name: 'Screen', startTime: secondAgoTimestampMs() }, (activeSpan: Span | undefined) => {
      const spanId = spanToJSON(activeSpan!).span_id;
      render(
        <>
          <TimeToFullDisplay record={true} />
          <TimeToFullDisplay record={false} />
        </>,
      );
      // The record=true reporter fires; record=false does not. fullDisplay=true
      // present in the tail.
      expect(tailHasFullDisplay(spanId, 2)).toBe(true);
      activeSpan?.end();
    });
  });

  test('different active spans have independent registries', () => {
    let firstSpanId = '';
    let secondSpanId = '';

    startSpanManual({ name: 'Screen A', startTime: secondAgoTimestampMs() }, (activeSpan: Span | undefined) => {
      firstSpanId = spanToJSON(activeSpan!).span_id;
      render(<TimeToFullDisplay ready={true} />);
      activeSpan?.end();
    });

    clearMockedOnDrawReportedProps();

    startSpanManual({ name: 'Screen B', startTime: secondAgoTimestampMs() }, (activeSpan: Span | undefined) => {
      secondSpanId = spanToJSON(activeSpan!).span_id;
      render(<TimeToFullDisplay ready={false} />);
      expect(tailHasFullDisplay(secondSpanId, 1)).toBe(false);
      activeSpan?.end();
    });

    expect(firstSpanId).not.toEqual(secondSpanId);
  });

  test('TTID `ready` aggregates symmetrically', () => {
    startSpanManual({ name: 'Screen', startTime: secondAgoTimestampMs() }, (activeSpan: Span | undefined) => {
      const spanId = spanToJSON(activeSpan!).span_id;

      const Screen = ({ a, b }: { a: boolean; b: boolean }) => (
        <>
          <TimeToInitialDisplay ready={a} />
          <TimeToInitialDisplay ready={b} />
        </>
      );

      const tree = render(<Screen a={false} b={true} />);
      expect(tailHasInitialDisplay(spanId, 2)).toBe(false);

      act(() => tree.rerender(<Screen a={true} b={true} />));
      expect(tailHasInitialDisplay(spanId, 2)).toBe(true);

      activeSpan?.end();
    });
  });
});
