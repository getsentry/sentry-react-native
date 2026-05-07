package io.sentry.react;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import io.sentry.android.core.SentryFramesDelayResult;
import io.sentry.android.core.internal.util.SentryFrameMetricsCollector;
import org.junit.Before;
import org.junit.Test;

public class RNSentryFramesDelayTest {

  private RNSentryModuleImpl module;
  private Promise promise;

  @Before
  public void setUp() throws Exception {
    ReactApplicationContext reactContext = mock(ReactApplicationContext.class);
    PackageManager packageManager = mock(PackageManager.class);
    when(packageManager.getPackageInfo(anyString(), anyInt())).thenReturn(new PackageInfo());
    when(reactContext.getPackageManager()).thenReturn(packageManager);
    when(reactContext.getPackageName()).thenReturn("com.test.app");
    module = new RNSentryModuleImpl(reactContext);
    promise = mock(Promise.class);
  }

  @Test
  public void resolvesNullWhenCollectorIsNull() {
    module.frameMetricsCollector = null;
    double now = System.currentTimeMillis() / 1e3;
    module.fetchNativeFramesDelay(now - 1.0, now, promise);
    verify(promise).resolve(isNull());
  }

  @Test
  public void resolvesDelayFromCollector() {
    SentryFrameMetricsCollector collector = mock(SentryFrameMetricsCollector.class);
    when(collector.getFramesDelay(anyLong(), anyLong()))
        .thenReturn(new SentryFramesDelayResult(0.123, 2));
    module.frameMetricsCollector = collector;

    double now = System.currentTimeMillis() / 1e3;
    module.fetchNativeFramesDelay(now - 1.0, now, promise);
    verify(promise).resolve(eq(0.123));
  }

  @Test
  public void resolvesNullWhenDelayIsNegative() {
    SentryFrameMetricsCollector collector = mock(SentryFrameMetricsCollector.class);
    when(collector.getFramesDelay(anyLong(), anyLong()))
        .thenReturn(new SentryFramesDelayResult(-1, 0));
    module.frameMetricsCollector = collector;

    double now = System.currentTimeMillis() / 1e3;
    module.fetchNativeFramesDelay(now - 1.0, now, promise);
    verify(promise).resolve(isNull());
  }

  @Test
  public void resolvesNullWhenStartIsInFuture() {
    SentryFrameMetricsCollector collector = mock(SentryFrameMetricsCollector.class);
    module.frameMetricsCollector = collector;

    double now = System.currentTimeMillis() / 1e3;
    module.fetchNativeFramesDelay(now + 100.0, now + 200.0, promise);
    verify(promise).resolve(isNull());
  }

  @Test
  public void resolvesZeroDelayWhenNoSlowFrames() {
    SentryFrameMetricsCollector collector = mock(SentryFrameMetricsCollector.class);
    when(collector.getFramesDelay(anyLong(), anyLong()))
        .thenReturn(new SentryFramesDelayResult(0.0, 0));
    module.frameMetricsCollector = collector;

    double now = System.currentTimeMillis() / 1e3;
    module.fetchNativeFramesDelay(now - 1.0, now, promise);
    verify(promise).resolve(eq(0.0));
  }
}
