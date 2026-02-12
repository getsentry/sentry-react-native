package io.sentry.react;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import io.sentry.ILogger;
import io.sentry.SentryLevel;
import io.sentry.android.core.AndroidLogger;
import java.lang.ref.WeakReference;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

/**
 * Custom ILogger implementation that wraps AndroidLogger and forwards log messages to React Native.
 * This allows native SDK logs to appear in the Metro console when debug mode is enabled.
 */
public class RNSentryLogger implements ILogger {
  private static final String TAG = "Sentry";
  private static final String EVENT_NAME = "SentryNativeLog";

  private final AndroidLogger androidLogger;
  private WeakReference<ReactApplicationContext> reactContextRef;

  public RNSentryLogger() {
    this.androidLogger = new AndroidLogger(TAG);
  }

  public void setReactContext(@Nullable ReactApplicationContext context) {
    this.reactContextRef = context != null ? new WeakReference<>(context) : null;
  }

  @Override
  public void log(@NotNull SentryLevel level, @NotNull String message, @Nullable Object... args) {
    // Always log to Logcat (default behavior)
    androidLogger.log(level, message, args);

    // Forward to JS
    String formattedMessage =
        (args == null || args.length == 0) ? message : String.format(message, args);
    forwardToJS(level, formattedMessage);
  }

  @Override
  public void log(
      @NotNull SentryLevel level, @NotNull String message, @Nullable Throwable throwable) {
    androidLogger.log(level, message, throwable);

    String fullMessage = throwable != null ? message + ": " + throwable.getMessage() : message;
    forwardToJS(level, fullMessage);
  }

  @Override
  public void log(
      @NotNull SentryLevel level,
      @Nullable Throwable throwable,
      @NotNull String message,
      @Nullable Object... args) {
    androidLogger.log(level, throwable, message, args);

    String formattedMessage =
        (args == null || args.length == 0) ? message : String.format(message, args);
    if (throwable != null) {
      formattedMessage += ": " + throwable.getMessage();
    }
    forwardToJS(level, formattedMessage);
  }

  @Override
  public boolean isEnabled(@Nullable SentryLevel level) {
    return androidLogger.isEnabled(level);
  }

  private void forwardToJS(@NotNull SentryLevel level, @NotNull String message) {
    ReactApplicationContext context = reactContextRef != null ? reactContextRef.get() : null;
    if (context == null || !context.hasActiveReactInstance()) {
      return;
    }

    try {
      WritableMap params = Arguments.createMap();
      params.putString("level", level.name().toLowerCase());
      params.putString("component", "Sentry");
      params.putString("message", message);

      context
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
          .emit(EVENT_NAME, params);
    } catch (Exception e) {
      // Silently ignore - don't cause issues if JS bridge isn't ready
      // We intentionally swallow this exception to avoid disrupting the app
      // when the React Native bridge is not yet initialized or has been torn down
      androidLogger.log(SentryLevel.DEBUG, "Failed to forward log to JS: " + e.getMessage());
    }
  }
}
