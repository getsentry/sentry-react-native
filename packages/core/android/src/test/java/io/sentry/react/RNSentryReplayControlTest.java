package io.sentry.react;

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
import io.sentry.IReplayApi;
import io.sentry.IScopes;
import io.sentry.ReplayController;
import io.sentry.Sentry;
import io.sentry.SentryOptions;
import io.sentry.protocol.SentryId;
import org.junit.Before;
import org.junit.Test;
import org.mockito.MockedStatic;

/**
 * Coverage for the Session Replay runtime controls exposed on {@link RNSentryModuleImpl} ({@code
 * startReplay}, {@code startReplayBuffering}, {@code stopReplay}, {@code pauseReplay}, {@code
 * resumeReplay}, {@code flushReplay}).
 *
 * <p>Each control forwards to the corresponding {@link IReplayApi} method returned by {@code
 * Sentry.replay()} and then resolves the promise with {@code null}.
 */
public class RNSentryReplayControlTest {

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

  @Test
  public void startReplayCallsSdkAndResolvesNull() {
    try (MockedStatic<Sentry> sentry = mockStatic(Sentry.class)) {
      final IReplayApi replay = mock(IReplayApi.class);
      sentry.when(Sentry::replay).thenReturn(replay);

      final Promise promise = mock(Promise.class);
      module.startReplay(promise);

      verify(replay).start();
      verify(promise).resolve(null);
    }
  }

  @Test
  public void startReplayBufferingCallsSdkAndResolvesNull() {
    try (MockedStatic<Sentry> sentry = mockStatic(Sentry.class)) {
      final IReplayApi replay = mock(IReplayApi.class);
      sentry.when(Sentry::replay).thenReturn(replay);

      final Promise promise = mock(Promise.class);
      module.startReplayBuffering(promise);

      verify(replay).startBuffering();
      verify(promise).resolve(null);
    }
  }

  @Test
  public void stopReplayCallsSdkAndResolvesNull() {
    try (MockedStatic<Sentry> sentry = mockStatic(Sentry.class)) {
      final IReplayApi replay = mock(IReplayApi.class);
      sentry.when(Sentry::replay).thenReturn(replay);

      final Promise promise = mock(Promise.class);
      module.stopReplay(promise);

      verify(replay).stop();
      verify(promise).resolve(null);
    }
  }

  @Test
  public void pauseReplayCallsSdkAndResolvesNull() {
    try (MockedStatic<Sentry> sentry = mockStatic(Sentry.class)) {
      final IReplayApi replay = mock(IReplayApi.class);
      sentry.when(Sentry::replay).thenReturn(replay);

      final Promise promise = mock(Promise.class);
      module.pauseReplay(promise);

      verify(replay).pause();
      verify(promise).resolve(null);
    }
  }

  @Test
  public void resumeReplayCallsSdkAndResolvesNull() {
    try (MockedStatic<Sentry> sentry = mockStatic(Sentry.class)) {
      final IReplayApi replay = mock(IReplayApi.class);
      sentry.when(Sentry::replay).thenReturn(replay);

      final Promise promise = mock(Promise.class);
      module.resumeReplay(promise);

      verify(replay).resume();
      verify(promise).resolve(null);
    }
  }

  @Test
  public void flushReplayCallsSdkAndResolvesNull() {
    try (MockedStatic<Sentry> sentry = mockStatic(Sentry.class)) {
      final IReplayApi replay = mock(IReplayApi.class);
      sentry.when(Sentry::replay).thenReturn(replay);

      final Promise promise = mock(Promise.class);
      module.flushReplay(promise);

      verify(replay).flush();
      verify(promise).resolve(null);
    }
  }

  @Test
  public void registerReplayTraceIdForwardsSentryIdToController() {
    try (MockedStatic<Sentry> sentry = mockStatic(Sentry.class)) {
      final ReplayController replayController = mock(ReplayController.class);
      final SentryOptions options = mock(SentryOptions.class);
      when(options.getReplayController()).thenReturn(replayController);
      final IScopes scopes = mock(IScopes.class);
      when(scopes.getOptions()).thenReturn(options);
      sentry.when(Sentry::getCurrentScopes).thenReturn(scopes);

      final String traceId = "d6566d2f24e848fe864f8d4df192d67c";
      module.registerReplayTraceId(traceId);

      // new SentryId(String) normalizes the un-hyphenated 32-char hex from JS.
      verify(replayController).registerTraceId(new SentryId(traceId));
    }
  }
}
