const shouldSentryAutoUploadNative = process.env.SENTRY_DISABLE_NATIVE_DEBUG_UPLOAD !== "true";
const shouldSentryAutoUploadGeneral = process.env.SENTRY_DISABLE_AUTO_UPLOAD !== "true";
const shouldSentryAutoUpload = shouldSentryAutoUploadGeneral && shouldSentryAutoUploadNative;

module.exports = {
  "expo": {
    "name": "sentry-react-native-expo-sample",
    "slug": "sentry-react-native-expo-sample",
    "jsEngine": "hermes",
    "scheme": "sentry-expo-sample",
    "version": "6.8.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "assetBundlePatterns": [
      "**/*"
    ],
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "io.sentry.expo.sample",
      "buildNumber": "38"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "package": "io.sentry.expo.sample",
      "versionCode": 38
    },
    "web": {
      "bundler": "metro",
      "output": "static",
      "favicon": "./assets/favicon.png"
    },
    "experiments": {
      "tsconfigPaths": true,
      "typedRoutes": true
    },
    "plugins": [
      [
        "@sentry/react-native/expo",
        {
          "url": "https://sentry.io/",
          "project": "sentry-react-native",
          "organization": "sentry-sdks",
          "experimental_android": {
            "enableAndroidGradlePlugin": true,
            "autoUploadProguardMapping": shouldSentryAutoUpload,
            "uploadNativeSymbols": shouldSentryAutoUpload,
            "includeNativeSources": shouldSentryAutoUpload,
            "includeSourceContext": shouldSentryAutoUpload
          }
        }
      ],
      [
        "expo-image-picker",
        {
          "photosPermission": "The app accesses your photos to let you share them with your friends."
        }
      ],
      [
        "expo-router",
        {
          "asyncRoutes": {
            "web": true,
            "default": "development"
          }
        }
      ]
    ]
  }
};
