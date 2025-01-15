package io.sentry.react;

import android.content.Context;
import com.facebook.react.bridge.ReadableMap;
import io.sentry.ILogger;
import io.sentry.android.core.AndroidLogger;
import java.util.Map;
import org.jetbrains.annotations.NotNull;
import org.json.JSONException;
import org.json.JSONObject;

public class RNSentrySDK {
  // private static final String CONFIGURATION_FILE = "sentry.options.json";
  private static final String NAME = "RNSentrySDK";

  private static final ILogger logger = new AndroidLogger(NAME);
  private RNSentryStart startSdk;

  public RNSentrySDK() {
    startSdk = new RNSentryStart();
  }

  private void startWithOptions(
      @NotNull final Context context, @NotNull final ReadableMap rnOptions) {
    startSdk.startWithOptions(context, rnOptions, null, logger);
  }

  /**
   * Start the Native Android SDK with the provided options
   *
   * @param context Android Context
   * @param options Map with options
   */
  public void startWithOptions(
      @NotNull final Context context, @NotNull final Map<String, Object> options) {
    ReadableMap rnOptions = RNSentryMapConverter.mapToReadableMap(options);
    startWithOptions(context, rnOptions);
  }

  /**
   * Start the Native Android SDK with options from `sentry.options.json` configuration file
   *
   * @param context Android Context
   */
  public void start(@NotNull final Context context) {
    String json =
        "{\"dsn\": \"https://1df17bd4e543fdb31351dee1768bb679@o447951.ingest.sentry.io/5428561\"}";
    try {
      ReadableMap rnOptions = RNSentryMapConverter.jsonObjectToReadableMap(new JSONObject(json));
      startWithOptions(context, rnOptions);
    } catch (JSONException e) {
      throw new RuntimeException(e);
    }
  }
}
