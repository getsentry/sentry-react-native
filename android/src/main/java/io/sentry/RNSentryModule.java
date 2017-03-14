
package io.sentry;

import java.util.HashMap;
import java.util.Map;
import java.util.logging.Logger;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Callback;

public class RNSentryModule extends ReactContextBaseJavaModule {

  private final ReactApplicationContext reactContext;
  final static Logger logger = Logger.getLogger("react-native-sentry");

  public RNSentryModule(ReactApplicationContext reactContext) {
    super(reactContext);
    this.reactContext = reactContext;
  }

  @Override
  public String getName() {
    return "RNSentry";
  }

  @Override
  public Map<String, Object> getConstants() {
    final Map<String, Object> constants = new HashMap<>();
    constants.put("nativeClientAvailable", false);
    return constants;
  }
}
