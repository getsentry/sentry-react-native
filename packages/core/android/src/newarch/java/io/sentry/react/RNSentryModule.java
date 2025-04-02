package io.sentry.react;

import androidx.annotation.NonNull;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;

public class RNSentryModule extends NativeRNSentrySpec {

  private final RNSentryModuleImpl impl;

  RNSentryModule(ReactApplicationContext reactContext) {
    super(reactContext);
    this.impl = new RNSentryModuleImpl(reactContext);
  }

  @Override
  @NonNull
  public String getName() {
    return RNSentryModuleImpl.NAME;
  }

  @Override
  public void addListener(String eventType) {
    this.impl.addListener(eventType);
  }

  @Override
  public void removeListeners(double id) {
    this.impl.removeListeners(id);
  }

  @Override
  public void initNativeReactNavigationNewFrameTracking(Promise promise) {
    this.impl.initNativeReactNavigationNewFrameTracking(promise);
  }

  @Override
  public void initNativeSdk(final ReadableMap rnOptions, Promise promise) {
    this.impl.initNativeSdk(rnOptions, promise);
  }

  @Override
  public void crash() {
    this.impl.crash();
  }

  @Override
  public void fetchModules(Promise promise) {
    this.impl.fetchModules(promise);
  }

  @Override
  public void fetchNativeRelease(Promise promise) {
    this.impl.fetchNativeRelease(promise);
  }

  @Override
  public void fetchNativeAppStart(Promise promise) {
    this.impl.fetchNativeAppStart(promise);
  }

  @Override
  public void fetchNativeFrames(Promise promise) {
    this.impl.fetchNativeFrames(promise);
  }

  @Override
  public void captureEnvelope(String rawBytes, ReadableMap options, Promise promise) {
    this.impl.captureEnvelope(rawBytes, options, promise);
  }

  @Override
  public void captureScreenshot(Promise promise) {
    this.impl.captureScreenshot(promise);
  }

  @Override
  public void fetchViewHierarchy(Promise promise) {
    this.impl.fetchViewHierarchy(promise);
  }

  @Override
  public void setUser(final ReadableMap user, final ReadableMap otherUserKeys) {
    this.impl.setUser(user, otherUserKeys);
  }

  @Override
  public void addBreadcrumb(final ReadableMap breadcrumb) {
    this.impl.addBreadcrumb(breadcrumb);
  }

  @Override
  public void clearBreadcrumbs() {
    this.impl.clearBreadcrumbs();
  }

  @Override
  public void setExtra(String key, String extra) {
    this.impl.setExtra(key, extra);
  }

  @Override
  public void setContext(final String key, final ReadableMap context) {
    this.impl.setContext(key, context);
  }

  @Override
  public void setTag(String key, String value) {
    this.impl.setTag(key, value);
  }

  @Override
  public void closeNativeSdk(Promise promise) {
    this.impl.closeNativeSdk(promise);
  }

  @Override
  public void enableNativeFramesTracking() {
    this.impl.enableNativeFramesTracking();
  }

  @Override
  public void disableNativeFramesTracking() {
    this.impl.disableNativeFramesTracking();
  }

  @Override
  public void fetchNativeDeviceContexts(Promise promise) {
    this.impl.fetchNativeDeviceContexts(promise);
  }

  @Override
  public void fetchNativeSdkInfo(Promise promise) {
    this.impl.fetchNativeSdkInfo(promise);
  }

  @Override
  public WritableMap startProfiling(boolean platformProfilers) {
    return this.impl.startProfiling(platformProfilers);
  }

  @Override
  public WritableMap stopProfiling() {
    return this.impl.stopProfiling();
  }

  @Override
  public String fetchNativePackageName() {
    return this.impl.fetchNativePackageName();
  }

  @Override
  public WritableMap fetchNativeStackFramesBy(ReadableArray instructionsAddr) {
    // Not used on Android
    return null;
  }

  @Override
  public void captureReplay(boolean isHardCrash, Promise promise) {
    this.impl.captureReplay(isHardCrash, promise);
  }

  @Override
  public String getCurrentReplayId() {
    return this.impl.getCurrentReplayId();
  }

  @Override
  public void crashedLastRun(Promise promise) {
    this.impl.crashedLastRun(promise);
  }

  @Override
  public void getNewScreenTimeToDisplay(Promise promise) {
    this.impl.getNewScreenTimeToDisplay(promise);
  }

  @Override
  public void getDataFromUri(String uri, Promise promise) {
    this.impl.getDataFromUri(uri, promise);
  }

  @Override
  public void popTimeToDisplayFor(String key, Promise promise) {
    this.impl.popTimeToDisplayFor(key, promise);
  }

  @Override
  public boolean setActiveSpanId(String spanId) {
    return this.impl.setActiveSpanId(spanId);
  }
}
