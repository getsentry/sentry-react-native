package io.sentry.react;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import androidx.fragment.app.FragmentActivity;
import androidx.fragment.app.FragmentManager;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import org.junit.Before;
import org.junit.Test;

/**
 * {@code initNativeReactNavigationNewFrameTracking} must settle its promise so the JS TurboModule
 * tracker pops the startup frame instead of leaking it for the process lifetime.
 */
public class RNSentryInitFrameTrackingTest {

  private RNSentryModuleImpl module;
  private Promise promise;
  private ReactApplicationContext reactContext;

  @Before
  public void setUp() throws Exception {
    reactContext = mock(ReactApplicationContext.class);
    PackageManager packageManager = mock(PackageManager.class);
    when(packageManager.getPackageInfo(anyString(), anyInt())).thenReturn(new PackageInfo());
    when(reactContext.getPackageManager()).thenReturn(packageManager);
    when(reactContext.getPackageName()).thenReturn("com.test.app");
    module = new RNSentryModuleImpl(reactContext);
    promise = mock(Promise.class);
  }

  @Test
  public void resolvesPromiseWhenNoCurrentActivity() {
    // No activity -> fragment tracking is skipped, but the promise must still settle.
    when(reactContext.getCurrentActivity()).thenReturn(null);

    module.initNativeReactNavigationNewFrameTracking(promise);

    verify(promise).resolve(isNull());
    verify(promise, never()).reject(anyString(), anyString());
  }

  @Test
  public void resolvesPromiseAndStillRegistersFragmentCallbacks() {
    // Settling the promise must not skip the frame-tracking registration.
    FragmentActivity activity = mock(FragmentActivity.class);
    FragmentManager fragmentManager = mock(FragmentManager.class);
    when(activity.getSupportFragmentManager()).thenReturn(fragmentManager);
    when(reactContext.getCurrentActivity()).thenReturn(activity);

    module.initNativeReactNavigationNewFrameTracking(promise);

    verify(fragmentManager)
        .registerFragmentLifecycleCallbacks(
            any(FragmentManager.FragmentLifecycleCallbacks.class), anyBoolean());
    verify(promise).resolve(isNull());
    verify(promise, never()).reject(anyString(), anyString());
  }
}
