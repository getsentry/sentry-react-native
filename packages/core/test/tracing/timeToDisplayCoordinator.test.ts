import {
  _resetTimeToDisplayCoordinator,
  clearSpan,
  hasAnyCheckpoints,
  isAllReady,
  registerCheckpoint,
  subscribe,
  updateCheckpoint,
} from '../../src/js/tracing/timeToDisplayCoordinator';

const SPAN_FIRST = 'span-first';
const SPAN_SECOND = 'span-second';

function flushDefer(): void {
  jest.runOnlyPendingTimers();
}

describe('timeToDisplayCoordinator', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    _resetTimeToDisplayCoordinator();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('empty registry is not ready', () => {
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(false);
    expect(hasAnyCheckpoints('ttfd', SPAN_FIRST)).toBe(false);
  });

  test('single not-ready checkpoint blocks', () => {
    registerCheckpoint('ttfd', SPAN_FIRST, 'a', false);
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(false);
  });

  test('single ready checkpoint resolves', () => {
    registerCheckpoint('ttfd', SPAN_FIRST, 'a', true);
    flushDefer();
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(true);
  });

  test('all ready resolves; one not-ready blocks', () => {
    registerCheckpoint('ttfd', SPAN_FIRST, 'a', true);
    registerCheckpoint('ttfd', SPAN_FIRST, 'b', true);
    registerCheckpoint('ttfd', SPAN_FIRST, 'c', false);
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(false);

    updateCheckpoint('ttfd', SPAN_FIRST, 'c', true);
    flushDefer();
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(true);
  });

  test('late-registering not-ready checkpoint makes the aggregate "non-ready"', () => {
    registerCheckpoint('ttfd', SPAN_FIRST, 'a', true);
    registerCheckpoint('ttfd', SPAN_FIRST, 'b', true);
    flushDefer();
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(true);

    registerCheckpoint('ttfd', SPAN_FIRST, 'c', false);
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(false);
  });

  test('different spans are independent', () => {
    registerCheckpoint('ttfd', SPAN_FIRST, 'a', true);
    registerCheckpoint('ttfd', SPAN_SECOND, 'a', false);
    flushDefer();
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(true);
    expect(isAllReady('ttfd', SPAN_SECOND)).toBe(false);
  });

  test('different kinds of spans are independent', () => {
    registerCheckpoint('ttfd', SPAN_FIRST, 'a', true);
    registerCheckpoint('ttid', SPAN_FIRST, 'a', false);
    flushDefer();
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(true);
    expect(isAllReady('ttid', SPAN_FIRST)).toBe(false);
  });

  test('subscribers are notified only on aggregate-ready flips', () => {
    const listener = jest.fn();
    subscribe('ttfd', SPAN_FIRST, listener);

    const unregister = registerCheckpoint('ttfd', SPAN_FIRST, 'a', false);
    expect(listener).toHaveBeenCalledTimes(0);
    updateCheckpoint('ttfd', SPAN_FIRST, 'a', true);
    flushDefer();
    expect(listener).toHaveBeenCalledTimes(1);
    unregister();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test('unsubscribe stops further notifications', () => {
    const listener = jest.fn();
    const unsubscribe = subscribe('ttfd', SPAN_FIRST, listener);
    unsubscribe();
    registerCheckpoint('ttfd', SPAN_FIRST, 'a', true);
    expect(listener).not.toHaveBeenCalled();
  });

  test('subscribers on one span ignore changes on another span', () => {
    const listener = jest.fn();
    subscribe('ttfd', SPAN_FIRST, listener);
    registerCheckpoint('ttfd', SPAN_SECOND, 'a', true);
    expect(listener).not.toHaveBeenCalled();
  });

  test('up-flip is deferred', () => {
    registerCheckpoint('ttfd', SPAN_FIRST, 'header', true);
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(false);

    registerCheckpoint('ttfd', SPAN_FIRST, 'sidebar', false);

    flushDefer();
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(false);
    updateCheckpoint('ttfd', SPAN_FIRST, 'sidebar', true);
    flushDefer();
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(true);
  });

  test('down-flip is immediate', () => {
    registerCheckpoint('ttfd', SPAN_FIRST, 'a', true);
    flushDefer();
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(true);

    registerCheckpoint('ttfd', SPAN_FIRST, 'b', false);
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(false);
  });
});
