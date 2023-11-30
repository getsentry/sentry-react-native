package com.samplenewarchitecture;
import android.content.Context;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableNativeArray;

import java.io.InputStream;

public class AssetsModule extends ReactContextBaseJavaModule {

    AssetsModule(ReactApplicationContext context) {
       super(context);
   }

    @Override
    public String getName() {
        return "AssetsModule";
    }

    @ReactMethod
    public void getExampleAssetData(Promise promise) {
        try {
            InputStream stream = this.getReactApplicationContext().getResources().getAssets()
                    .open("logo_mini.png");
            int size = stream.available();
            byte[] buffer = new byte[size];
            stream.read(buffer);
            stream.close();
            WritableArray array = new WritableNativeArray();
            for (int i = 0; i < size; i++) {
                array.pushInt(buffer[i]);
            }
            promise.resolve(array);
        } catch (Exception e) {
            promise.reject(e);
        }
    }
}
