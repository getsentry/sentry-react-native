package expo.modules.core.interfaces;

import android.content.Context;
import java.util.Collections;
import java.util.List;

public interface Package {
  default List<? extends ReactNativeHostHandler> createReactNativeHostHandlers(Context context) {
    return Collections.emptyList();
  }
}
