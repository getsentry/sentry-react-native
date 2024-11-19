package com.testappplain;

import android.content.Intent;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class AppReadyModule extends ReactContextBaseJavaModule {

  private final ReactApplicationContext reactContext;

  public AppReadyModule(ReactApplicationContext reactContext) {
    super(reactContext);
    this.reactContext = reactContext;
  }

  @Override
  public String getName() {
    return "ActivityStarter";
  }

  @ReactMethod
  public void startAppReadyActivity() {
    Intent intent = new Intent(reactContext, AppReadyActivity.class);
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    reactContext.startActivity(intent);
  }
}
