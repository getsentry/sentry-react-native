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

/** Flush the coordinator's deferred up-flip timer. */
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

  test('late-registering not-ready checkpoint un-readies the aggregate', () => {
    registerCheckpoint('ttfd', SPAN_FIRST, 'a', true);
    registerCheckpoint('ttfd', SPAN_FIRST, 'b', true);
    flushDefer();
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(true);

    registerCheckpoint('ttfd', SPAN_FIRST, 'c', false);
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(false);
  });

  test('unregistering the sole blocker keeps the aggregate not-ready (sticky)', () => {
    // A not-ready checkpoint that unmounts while it is the sole blocker is
    // kept in the registry to prevent a premature aggregate flip. Otherwise
    // a conditionally-rendered loading section that disappears before its
    // data resolves would silently record an incomplete display.
    registerCheckpoint('ttfd', SPAN_FIRST, 'a', true);
    const unregisterB = registerCheckpoint('ttfd', SPAN_FIRST, 'b', false);
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(false);

    unregisterB();
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(false);
    // The sticky 'b' is still tracked so a subsequent component on the same
    // span continues to see it as a blocker.
    expect(hasAnyCheckpoints('ttfd', SPAN_FIRST)).toBe(true);
  });

  test('unregistering a non-sole-blocker not-ready checkpoint removes it normally', () => {
    // When other not-ready checkpoints are still present, removing one
    // would not flip the aggregate, so the sticky safeguard does not apply.
    registerCheckpoint('ttfd', SPAN_FIRST, 'a', false);
    const unregisterB = registerCheckpoint('ttfd', SPAN_FIRST, 'b', false);

    unregisterB();
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(false);
    // 'a' remains, 'b' is gone.
    updateCheckpoint('ttfd', SPAN_FIRST, 'a', true);
    flushDefer();
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(true);
  });

  test('unregistering a ready checkpoint never goes sticky', () => {
    registerCheckpoint('ttfd', SPAN_FIRST, 'a', false);
    const unregisterB = registerCheckpoint('ttfd', SPAN_FIRST, 'b', true);

    unregisterB();
    // 'a' is still blocking; 'b' was ready so removing it is safe.
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(false);
    updateCheckpoint('ttfd', SPAN_FIRST, 'a', true);
    flushDefer();
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(true);
  });

  test('unregistering the last checkpoint leaves aggregate not-ready', () => {
    const unregister = registerCheckpoint('ttfd', SPAN_FIRST, 'a', true);
    flushDefer();
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(true);

    unregister();
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(false);
    expect(hasAnyCheckpoints('ttfd', SPAN_FIRST)).toBe(false);
  });

  test('different spans are independent', () => {
    registerCheckpoint('ttfd', SPAN_FIRST, 'a', true);
    registerCheckpoint('ttfd', SPAN_SECOND, 'a', false);
    flushDefer();
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(true);
    expect(isAllReady('ttfd', SPAN_SECOND)).toBe(false);
  });

  test('different kinds are independent', () => {
    registerCheckpoint('ttfd', SPAN_FIRST, 'a', true);
    registerCheckpoint('ttid', SPAN_FIRST, 'a', false);
    flushDefer();
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(true);
    expect(isAllReady('ttid', SPAN_FIRST)).toBe(false);
  });

  test('updateCheckpoint is a no-op for unknown id', () => {
    const listener = jest.fn();
    subscribe('ttfd', SPAN_FIRST, listener);
    updateCheckpoint('ttfd', SPAN_FIRST, 'nope', true);
    expect(listener).not.toHaveBeenCalled();
  });

  test('updateCheckpoint with same ready value does not notify', () => {
    registerCheckpoint('ttfd', SPAN_FIRST, 'a', true);
    const listener = jest.fn();
    subscribe('ttfd', SPAN_FIRST, listener);
    updateCheckpoint('ttfd', SPAN_FIRST, 'a', true);
    expect(listener).not.toHaveBeenCalled();
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

  test('non-flipping checkpoint changes do not wake subscribers (storm avoidance)', () => {
    const listener = jest.fn();
    subscribe('ttfd', SPAN_FIRST, listener);

    for (let i = 0; i < 10; i++) {
      registerCheckpoint('ttfd', SPAN_FIRST, `cp-${i}`, false);
    }
    expect(listener).toHaveBeenCalledTimes(0);

    for (let i = 0; i < 9; i++) {
      updateCheckpoint('ttfd', SPAN_FIRST, `cp-${i}`, true);
    }
    expect(listener).toHaveBeenCalledTimes(0);

    updateCheckpoint('ttfd', SPAN_FIRST, 'cp-9', true);
    flushDefer();
    expect(listener).toHaveBeenCalledTimes(1);
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

  test('up-flip is deferred so a same-task late-mounting peer can cancel it', () => {
    // The defining race: header registers ready=true alone, sidebar mounts
    // a tick later (e.g. parent useEffect setState→child mount). Without the
    // defer, header would fire instantly. With the defer, sidebar's
    // registration cancels the pending up-flip before it fires.
    registerCheckpoint('ttfd', SPAN_FIRST, 'header', true);
    // Aggregate is *raw* ready, but `isAllReady` (deferred view) is still false.
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(false);

    // Same-task: sidebar mounts before the timer macrotask runs.
    registerCheckpoint('ttfd', SPAN_FIRST, 'sidebar', false);

    flushDefer();
    // Aggregate must NOT have flipped — the defer protected us.
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(false);

    // Sidebar resolves — now we get a real ready transition.
    updateCheckpoint('ttfd', SPAN_FIRST, 'sidebar', true);
    flushDefer();
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(true);
  });

  test('down-flip is immediate (cancels pending up-flip and not deferred itself)', () => {
    registerCheckpoint('ttfd', SPAN_FIRST, 'a', true);
    flushDefer();
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(true);

    registerCheckpoint('ttfd', SPAN_FIRST, 'b', false);
    // No flushDefer: down-flip is immediate.
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(false);
  });

  test('clearSpan drops all coordinator state for a span', () => {
    // Simulates the integration calling clearSpan after popTimeToDisplayFor
    // returns. Prevents the registries from accumulating entries for screens
    // that outlive their span (keep-alive, idle-timeout discarded txns, etc.).
    registerCheckpoint('ttfd', SPAN_FIRST, 'a', true);
    registerCheckpoint('ttid', SPAN_FIRST, 'a', true);
    registerCheckpoint('ttfd', SPAN_SECOND, 'a', true);
    flushDefer();
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(true);
    flushDefer();
    expect(isAllReady('ttid', SPAN_FIRST)).toBe(true);
    flushDefer();
    expect(isAllReady('ttfd', SPAN_SECOND)).toBe(true);

    clearSpan(SPAN_FIRST);

    expect(hasAnyCheckpoints('ttfd', SPAN_FIRST)).toBe(false);
    expect(hasAnyCheckpoints('ttid', SPAN_FIRST)).toBe(false);
    // Other spans untouched.
    flushDefer();
    expect(isAllReady('ttfd', SPAN_SECOND)).toBe(true);
  });

  test('clearSpan also drops sticky checkpoints', () => {
    registerCheckpoint('ttfd', SPAN_FIRST, 'a', true);
    const unregisterB = registerCheckpoint('ttfd', SPAN_FIRST, 'b', false);
    unregisterB(); // becomes sticky
    expect(hasAnyCheckpoints('ttfd', SPAN_FIRST)).toBe(true);

    clearSpan(SPAN_FIRST);
    expect(hasAnyCheckpoints('ttfd', SPAN_FIRST)).toBe(false);
  });
});
