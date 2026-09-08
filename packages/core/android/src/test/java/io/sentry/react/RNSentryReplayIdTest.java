package io.sentry.react;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import io.sentry.IScope;
import io.sentry.IScopes;
import io.sentry.ReplayController;
import io.sentry.Sentry;
import io.sentry.SentryOptions;
import io.sentry.android.core.InternalSentrySdk;
import io.sentry.protocol.SentryId;
import org.junit.Before;
import org.junit.Test;
import org.mockito.MockedStatic;

/**
 * Coverage for {@link RNSentryModuleImpl#getCurrentReplayId()} and its buffer (on-error) replay
 * lookup added for https://github.com/getsentry/sentry-react-native/issues/6598.
 *
 * <p>A buffer replay's id is assigned by the {@link ReplayController} when recording starts, but
 * the scope's replayId is only populated once a replay is sent. The JS mobile replay integration
 * must be able to read the buffered id BEFORE the replay is flushed, so {@code
 * getCurrentReplayId()} prefers the controller's id and only falls back to the scope.
 */
public class RNSentryReplayIdTest {

  private RNSentryModuleImpl module;

  @Before
  public void setUp() throws Exception {
    ReactApplicationContext reactContext = mock(ReactApplicationContext.class);
    PackageManager packageManager = mock(PackageManager.class);
    when(packageManager.getPackageInfo(anyString(), anyInt())).thenReturn(new PackageInfo());
    when(reactContext.getPackageManager()).thenReturn(packageManager);
    when(reactContext.getPackageName()).thenReturn("com.test.app");
    module = new RNSentryModuleImpl(reactContext);
  }

  /**
   * Wires {@code Sentry.getCurrentScopes().getOptions().getReplayController()} to return the id and
   * hands back the mocked controller so callers can verify interactions with it.
   */
  private ReplayController stubControllerReplayId(
      final MockedStatic<Sentry> sentry, final SentryId id) {
    final ReplayController replayController = mock(ReplayController.class);
    when(replayController.getReplayId()).thenReturn(id);
    final SentryOptions options = mock(SentryOptions.class);
    when(options.getReplayController()).thenReturn(replayController);
    final IScopes scopes = mock(IScopes.class);
    when(scopes.getOptions()).thenReturn(options);
    sentry.when(Sentry::getCurrentScopes).thenReturn(scopes);
    return replayController;
  }

  @Test
  public void prefersReplayControllerIdWhenBuffering() {
    // A buffer replay is recording: the controller exposes its id even though the scope has none.
    final SentryId bufferedId = new SentryId();

    try (MockedStatic<Sentry> sentry = mockStatic(Sentry.class);
        MockedStatic<InternalSentrySdk> internal = mockStatic(InternalSentrySdk.class)) {
      stubControllerReplayId(sentry, bufferedId);
      // Scope has no replay id yet — the fix must not depend on it.
      final IScope scope = mock(IScope.class);
      when(scope.getReplayId()).thenReturn(SentryId.EMPTY_ID);
      internal.when(InternalSentrySdk::getCurrentScope).thenReturn(scope);

      assertEquals(bufferedId.toString(), module.getCurrentReplayId());
    }
  }

  @Test
  public void fallsBackToScopeIdWhenControllerEmpty() {
    // A full-session replay was sent: the controller reports empty, the id lives on the scope.
    final SentryId scopeId = new SentryId();

    try (MockedStatic<Sentry> sentry = mockStatic(Sentry.class);
        MockedStatic<InternalSentrySdk> internal = mockStatic(InternalSentrySdk.class)) {
      stubControllerReplayId(sentry, SentryId.EMPTY_ID);
      final IScope scope = mock(IScope.class);
      when(scope.getReplayId()).thenReturn(scopeId);
      internal.when(InternalSentrySdk::getCurrentScope).thenReturn(scope);

      assertEquals(scopeId.toString(), module.getCurrentReplayId());
    }
  }

  @Test
  public void returnsNullWhenControllerEmptyAndScopeEmpty() {
    try (MockedStatic<Sentry> sentry = mockStatic(Sentry.class);
        MockedStatic<InternalSentrySdk> internal = mockStatic(InternalSentrySdk.class)) {
      stubControllerReplayId(sentry, SentryId.EMPTY_ID);
      final IScope scope = mock(IScope.class);
      when(scope.getReplayId()).thenReturn(SentryId.EMPTY_ID);
      internal.when(InternalSentrySdk::getCurrentScope).thenReturn(scope);

      assertNull(module.getCurrentReplayId());
    }
  }

  @Test
  public void returnsNullWhenControllerEmptyAndScopeNull() {
    try (MockedStatic<Sentry> sentry = mockStatic(Sentry.class);
        MockedStatic<InternalSentrySdk> internal = mockStatic(InternalSentrySdk.class)) {
      stubControllerReplayId(sentry, SentryId.EMPTY_ID);
      internal.when(InternalSentrySdk::getCurrentScope).thenReturn(null);

      assertNull(module.getCurrentReplayId());
    }
  }

  @Test
  public void captureReplayResolvesNullOnSamplingMissEvenWhileBuffering() {
    // On an on-error sampling miss the controller still holds the buffered id, but the scope has
    // none because nothing was uploaded. captureReplay must resolve null (matching iOS), rather
    // than leak the buffered id as if a replay had been sent.
    final SentryId bufferedId = new SentryId();

    try (MockedStatic<Sentry> sentry = mockStatic(Sentry.class);
        MockedStatic<InternalSentrySdk> internal = mockStatic(InternalSentrySdk.class)) {
      final ReplayController replayController = stubControllerReplayId(sentry, bufferedId);
      final IScope scope = mock(IScope.class);
      when(scope.getReplayId()).thenReturn(SentryId.EMPTY_ID);
      internal.when(InternalSentrySdk::getCurrentScope).thenReturn(scope);

      final Promise promise = mock(Promise.class);
      module.captureReplay(true, promise);

      verify(replayController).captureReplay(true);
      verify(promise).resolve(null);
    }
  }

  @Test
  public void captureReplayResolvesScopeIdWhenReplayWasSent() {
    // When a replay is actually sent the scope carries its id; captureReplay resolves that, not the
    // controller's id, so JS learns the real uploaded replay id.
    final SentryId bufferedId = new SentryId();
    final SentryId scopeId = new SentryId();

    try (MockedStatic<Sentry> sentry = mockStatic(Sentry.class);
        MockedStatic<InternalSentrySdk> internal = mockStatic(InternalSentrySdk.class)) {
      final ReplayController replayController = stubControllerReplayId(sentry, bufferedId);
      final IScope scope = mock(IScope.class);
      when(scope.getReplayId()).thenReturn(scopeId);
      internal.when(InternalSentrySdk::getCurrentScope).thenReturn(scope);

      final Promise promise = mock(Promise.class);
      module.captureReplay(false, promise);

      verify(replayController).captureReplay(false);
      verify(promise).resolve(scopeId.toString());
    }
  }
}
