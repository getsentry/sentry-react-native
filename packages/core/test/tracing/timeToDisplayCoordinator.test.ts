import {
  _resetTimeToDisplayCoordinator,
  hasAnyCheckpoints,
  isAllReady,
  registerCheckpoint,
  subscribe,
  updateCheckpoint,
} from '../../src/js/tracing/timeToDisplayCoordinator';

const SPAN_FIRST = 'span-first';
const SPAN_SECOND = 'span-second';

describe('timeToDisplayCoordinator', () => {
  beforeEach(() => {
    _resetTimeToDisplayCoordinator();
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
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(true);
  });

  test('all ready resolves; one not-ready blocks', () => {
    registerCheckpoint('ttfd', SPAN_FIRST, 'a', true);
    registerCheckpoint('ttfd', SPAN_FIRST, 'b', true);
    registerCheckpoint('ttfd', SPAN_FIRST, 'c', false);
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(false);

    updateCheckpoint('ttfd', SPAN_FIRST, 'c', true);
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(true);
  });

  test('late-registering not-ready checkpoint un-readies the aggregate', () => {
    registerCheckpoint('ttfd', SPAN_FIRST, 'a', true);
    registerCheckpoint('ttfd', SPAN_FIRST, 'b', true);
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
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(true);
  });

  test('unregistering a ready checkpoint never goes sticky', () => {
    registerCheckpoint('ttfd', SPAN_FIRST, 'a', false);
    const unregisterB = registerCheckpoint('ttfd', SPAN_FIRST, 'b', true);

    unregisterB();
    // 'a' is still blocking; 'b' was ready so removing it is safe.
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(false);
    updateCheckpoint('ttfd', SPAN_FIRST, 'a', true);
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(true);
  });

  test('unregistering the last checkpoint leaves aggregate not-ready', () => {
    const unregister = registerCheckpoint('ttfd', SPAN_FIRST, 'a', true);
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(true);

    unregister();
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(false);
    expect(hasAnyCheckpoints('ttfd', SPAN_FIRST)).toBe(false);
  });

  test('different spans are independent', () => {
    registerCheckpoint('ttfd', SPAN_FIRST, 'a', true);
    registerCheckpoint('ttfd', SPAN_SECOND, 'a', false);
    expect(isAllReady('ttfd', SPAN_FIRST)).toBe(true);
    expect(isAllReady('ttfd', SPAN_SECOND)).toBe(false);
  });

  test('different kinds are independent', () => {
    registerCheckpoint('ttfd', SPAN_FIRST, 'a', true);
    registerCheckpoint('ttid', SPAN_FIRST, 'a', false);
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
});
