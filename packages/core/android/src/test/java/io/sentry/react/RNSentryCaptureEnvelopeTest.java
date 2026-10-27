package io.sentry.react;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.util.Log;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReadableMap;
import io.sentry.Hint;
import io.sentry.IScopes;
import io.sentry.Scope;
import io.sentry.ScopeCallback;
import io.sentry.Sentry;
import io.sentry.SentryEnvelope;
import io.sentry.SentryEnvelopeItem;
import io.sentry.SentryEvent;
import io.sentry.SentryItemType;
import io.sentry.SentryOptions;
import io.sentry.Session;
import io.sentry.android.core.InternalSentrySdk;
import io.sentry.cache.EnvelopeCache;
import io.sentry.cache.IEnvelopeCache;
import io.sentry.transport.NoOpEnvelopeCache;
import io.sentry.vendor.Base64;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.mockito.ArgumentCaptor;
import org.mockito.MockedStatic;

/**
 * A fatal JS error is rethrown by React Native as JavascriptException, which the SDK ignores, so
 * the process dies right after captureEnvelope returns. The hard-crash path must write the envelope
 * to disk on the calling thread instead of queueing it on the transport executor
 * (https://github.com/getsentry/sentry-react-native/issues/6918).
 */
public class RNSentryCaptureEnvelopeTest {

  @Rule public TemporaryFolder tmp = new TemporaryFolder();

  private ReactApplicationContext reactContext;
  private RNSentryModuleImpl module;
  private SentryOptions options;
  private Scope scope;
  private IScopes scopes;
  private IEnvelopeCache cache;
  private Promise promise;

  @Before
  public void setUp() throws Exception {
    reactContext = mock(ReactApplicationContext.class);
    PackageManager packageManager = mock(PackageManager.class);
    when(packageManager.getPackageInfo(anyString(), anyInt())).thenReturn(new PackageInfo());
    when(reactContext.getPackageManager()).thenReturn(packageManager);
    when(reactContext.getPackageName()).thenReturn("com.test.app");
    module = new RNSentryModuleImpl(reactContext);

    options = new SentryOptions();
    options.setDsn("https://key@sentry.io/1");
    options.setRelease("1.0.0");
    options.setCacheDirPath(tmp.getRoot().getAbsolutePath());
    cache = mock(IEnvelopeCache.class);
    when(cache.storeEnvelope(any(), any())).thenReturn(true);
    options.setEnvelopeDiskCache(cache);

    scope = new Scope(options);
    scopes = mock(IScopes.class);
    when(scopes.getOptions()).thenReturn(options);
    doAnswer(
            invocation -> {
              ((ScopeCallback) invocation.getArgument(0)).run(scope);
              return null;
            })
        .when(scopes)
        .configureScope(any(ScopeCallback.class));

    promise = mock(Promise.class);
  }

  private static ReadableMap hardCrashed(final boolean value) {
    final ReadableMap map = mock(ReadableMap.class);
    when(map.hasKey("hardCrashed")).thenReturn(true);
    when(map.getBoolean("hardCrashed")).thenReturn(value);
    return map;
  }

  private String eventEnvelope() throws Exception {
    final SentryEnvelope envelope =
        SentryEnvelope.from(options.getSerializer(), new SentryEvent(), null);
    final ByteArrayOutputStream out = new ByteArrayOutputStream();
    options.getSerializer().serialize(envelope, out);
    return Base64.encodeToString(out.toByteArray(), Base64.DEFAULT);
  }

  private static List<SentryItemType> itemTypes(final SentryEnvelope envelope) {
    final List<SentryItemType> types = new ArrayList<>();
    for (final SentryEnvelopeItem item : envelope.getItems()) {
      types.add(item.getHeader().getType());
    }
    return types;
  }

  @Test
  public void hardCrashStoresEnvelopeOnCallingThreadAndDoesNotQueueIt() throws Exception {
    try (MockedStatic<Sentry> sentry = mockStatic(Sentry.class);
        MockedStatic<InternalSentrySdk> internal = mockStatic(InternalSentrySdk.class)) {
      sentry.when(Sentry::getCurrentScopes).thenReturn(scopes);

      module.captureEnvelope(eventEnvelope(), hardCrashed(true), promise);

      final ArgumentCaptor<SentryEnvelope> stored = ArgumentCaptor.forClass(SentryEnvelope.class);
      verify(cache).storeEnvelope(stored.capture(), any(Hint.class));
      assertEquals(List.of(SentryItemType.Event), itemTypes(stored.getValue()));
      verify(scopes, never()).captureEnvelope(any());
      internal.verify(() -> InternalSentrySdk.captureEnvelope(any(), anyBoolean()), never());
      verify(promise).resolve(true);
    }
  }

  @Test
  public void hardCrashEndsSessionAsCrashedAndAttachesIt() throws Exception {
    scope.startSession();
    final File sessionFile = EnvelopeCache.getCurrentSessionFile(options.getCacheDirPath());
    assertTrue(sessionFile.getParentFile().mkdirs());
    assertTrue(sessionFile.createNewFile());

    try (MockedStatic<Sentry> sentry = mockStatic(Sentry.class);
        MockedStatic<Log> ignored = mockStatic(Log.class)) {
      sentry.when(Sentry::getCurrentScopes).thenReturn(scopes);

      module.captureEnvelope(eventEnvelope(), hardCrashed(true), promise);

      final ArgumentCaptor<SentryEnvelope> stored = ArgumentCaptor.forClass(SentryEnvelope.class);
      verify(cache).storeEnvelope(stored.capture(), any(Hint.class));
      assertEquals(
          List.of(SentryItemType.Event, SentryItemType.Session), itemTypes(stored.getValue()));

      Session attached = null;
      for (final SentryEnvelopeItem item : stored.getValue().getItems()) {
        if (item.getHeader().getType() == SentryItemType.Session) {
          attached =
              options
                  .getSerializer()
                  .deserialize(
                      new InputStreamReader(new ByteArrayInputStream(item.getData()), UTF_8),
                      Session.class);
        }
      }
      assertNotNull(attached);
      assertEquals(Session.State.Crashed, attached.getStatus());
      assertEquals(1, attached.errorCount());
      assertNotNull(attached.getTimestamp());
      assertNull(scope.withSession(session -> {}));
      assertFalse(sessionFile.exists());
    }
  }

  @Test
  public void hardCrashFallsBackToQueueWhenStoreFails() throws Exception {
    when(cache.storeEnvelope(any(), any())).thenReturn(false);

    try (MockedStatic<Sentry> sentry = mockStatic(Sentry.class);
        MockedStatic<Log> ignored = mockStatic(Log.class)) {
      sentry.when(Sentry::getCurrentScopes).thenReturn(scopes);

      module.captureEnvelope(eventEnvelope(), hardCrashed(true), promise);

      verify(cache).storeEnvelope(any(), any(Hint.class));
      verify(scopes).captureEnvelope(any(SentryEnvelope.class));
      verify(promise).resolve(true);
    }
  }

  @Test
  public void hardCrashKeepsSessionFileWhenStoreFails() throws Exception {
    when(cache.storeEnvelope(any(), any())).thenReturn(false);
    scope.startSession();
    final File sessionFile = EnvelopeCache.getCurrentSessionFile(options.getCacheDirPath());
    assertTrue(sessionFile.getParentFile().mkdirs());
    assertTrue(sessionFile.createNewFile());

    try (MockedStatic<Sentry> sentry = mockStatic(Sentry.class);
        MockedStatic<Log> ignored = mockStatic(Log.class)) {
      sentry.when(Sentry::getCurrentScopes).thenReturn(scopes);

      module.captureEnvelope(eventEnvelope(), hardCrashed(true), promise);

      verify(scopes).captureEnvelope(any(SentryEnvelope.class));
      assertTrue(sessionFile.exists());
    }
  }

  @Test
  public void hardCrashUsesQueuedPathInDebuggableApp() throws Exception {
    final ApplicationInfo appInfo = new ApplicationInfo();
    appInfo.flags = ApplicationInfo.FLAG_DEBUGGABLE;
    when(reactContext.getApplicationInfo()).thenReturn(appInfo);
    final String rawBytes = eventEnvelope();

    try (MockedStatic<Sentry> sentry = mockStatic(Sentry.class);
        MockedStatic<InternalSentrySdk> internal = mockStatic(InternalSentrySdk.class)) {
      sentry.when(Sentry::getCurrentScopes).thenReturn(scopes);

      module.captureEnvelope(rawBytes, hardCrashed(true), promise);

      verify(cache, never()).storeEnvelope(any(), any());
      internal.verify(
          () ->
              InternalSentrySdk.captureEnvelope(
                  eq(Base64.decode(rawBytes, Base64.DEFAULT)), eq(false)));
      verify(promise).resolve(true);
    }
  }

  @Test
  public void hardCrashUsesQueuedPathWithoutDiskCache() throws Exception {
    options.setEnvelopeDiskCache(NoOpEnvelopeCache.getInstance());
    final String rawBytes = eventEnvelope();

    try (MockedStatic<Sentry> sentry = mockStatic(Sentry.class);
        MockedStatic<InternalSentrySdk> internal = mockStatic(InternalSentrySdk.class)) {
      sentry.when(Sentry::getCurrentScopes).thenReturn(scopes);

      module.captureEnvelope(rawBytes, hardCrashed(true), promise);

      internal.verify(
          () ->
              InternalSentrySdk.captureEnvelope(
                  eq(Base64.decode(rawBytes, Base64.DEFAULT)), eq(false)));
      verify(promise).resolve(true);
    }
  }

  @Test
  public void nonFatalEventUsesQueuedPath() throws Exception {
    final String rawBytes = eventEnvelope();

    try (MockedStatic<Sentry> sentry = mockStatic(Sentry.class);
        MockedStatic<InternalSentrySdk> internal = mockStatic(InternalSentrySdk.class)) {
      sentry.when(Sentry::getCurrentScopes).thenReturn(scopes);

      module.captureEnvelope(rawBytes, hardCrashed(false), promise);

      verify(cache, never()).storeEnvelope(any(), any());
      internal.verify(
          () ->
              InternalSentrySdk.captureEnvelope(
                  eq(Base64.decode(rawBytes, Base64.DEFAULT)), eq(true)));
      verify(promise).resolve(true);
    }
  }
}
