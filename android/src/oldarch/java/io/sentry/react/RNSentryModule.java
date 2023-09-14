package io.sentry.react;

import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

public class RNSentryModule extends ReactContextBaseJavaModule {

    private final RNSentryModuleImpl impl;

    RNSentryModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.impl = new RNSentryModuleImpl(reactContext);
    }

    @Override
    public String getName() {
        return RNSentryModuleImpl.NAME;
    }

    @ReactMethod
    public void initNativeSdk(final ReadableMap rnOptions, Promise promise) {
        this.impl.initNativeSdk(rnOptions, promise);
    }

    @ReactMethod
    public void crash() {
        this.impl.crash();
    }

    @ReactMethod
    public void fetchModules(Promise promise) {
        this.impl.fetchModules(promise);
    }

    @ReactMethod
    public void fetchNativeRelease(Promise promise) {
        this.impl.fetchNativeRelease(promise);
    }

    @ReactMethod
    public void fetchNativeAppStart(Promise promise) {
        this.impl.fetchNativeAppStart(promise);
    }

    @ReactMethod
    public void fetchNativeFrames(Promise promise) {
        this.impl.fetchNativeFrames(promise);
    }

    @ReactMethod
    public void captureEnvelope(ReadableArray rawBytes, ReadableMap options, Promise promise) {
        this.impl.captureEnvelope(rawBytes, options, promise);
    }

    @ReactMethod
    public void captureScreenshot(Promise promise) {
        this.impl.captureScreenshot(promise);
    }

    @ReactMethod
    public void fetchViewHierarchy(Promise promise){
        this.impl.fetchViewHierarchy(promise);
    }

    @ReactMethod
    public void setUser(final ReadableMap user, final ReadableMap otherUserKeys) {
        this.impl.setUser(user, otherUserKeys);
    }

    @ReactMethod
    public void addBreadcrumb(final ReadableMap breadcrumb) {
        this.impl.addBreadcrumb(breadcrumb);
    }

    @ReactMethod
    public void clearBreadcrumbs() {
        this.impl.clearBreadcrumbs();
    }

    @ReactMethod
    public void setExtra(String key, String extra) {
        this.impl.setExtra(key, extra);
    }

    @ReactMethod
    public void setContext(final String key, final ReadableMap context) {
        this.impl.setContext(key, context);
    }

    @ReactMethod
    public void setTag(String key, String value) {
        this.impl.setTag(key, value);
    }

    @ReactMethod
    public void closeNativeSdk(Promise promise) {
        this.impl.closeNativeSdk(promise);
    }

    @ReactMethod
    public void enableNativeFramesTracking() {
        this.impl.enableNativeFramesTracking();
    }

    @ReactMethod
    public void disableNativeFramesTracking() {
        this.impl.disableNativeFramesTracking();
    }

    @ReactMethod
    public void fetchNativeDeviceContexts(Promise promise) {
        this.impl.fetchNativeDeviceContexts(promise);
    }

    @ReactMethod
    public void fetchNativeSdkInfo(Promise promise) {
        this.impl.fetchNativeSdkInfo(promise);
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    public WritableMap startProfiling() {
        return this.impl.startProfiling();
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    public WritableMap stopProfiling() {
        return this.impl.stopProfiling();
    }

    @ReactMethod
    public void fetchNativePackageName(Promise promise) {
        this.impl.fetchNativePackageName(promise);
    }

    @ReactMethod
    public void fetchNativeStackFramesBy(ReadableArray instructionsAddr, Promise promise) {
        // Not used on Android
    }
}
