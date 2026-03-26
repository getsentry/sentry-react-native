package expo.modules.core.interfaces;

public interface ReactNativeHostHandler {
  default void onReactInstanceException(boolean useDeveloperSupport, Exception exception) {
    // default empty implementation
  }
}
