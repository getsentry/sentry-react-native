import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { isRunningInExpoGo } from 'expo';
import { useFonts } from 'expo-font';
import { SplashScreen, Stack, useNavigationContainerRef } from 'expo-router';
import { useEffect } from 'react';

import { useColorScheme } from '@/components/useColorScheme';
import { SENTRY_INTERNAL_DSN } from '../utils/dsn';
import * as Sentry from '@sentry/react-native';
import { LogBox } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { withSentryPlayground } from '@sentry/react-native/playground';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

LogBox.ignoreAllLogs();

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: !isRunningInExpoGo(), // This is not supported in Expo Go.
});

Sentry.init({
  // Replace the example DSN below with your own DSN:
  dsn: 'https://c96d5b6136315b7a6cef6230a38b4842@o4509786567475200.ingest.de.sentry.io/4510182962298960',
  debug: true,
  environment: 'dev',
  enableLogs: true,
  beforeSend: (event: Sentry.ErrorEvent) => {
    console.log('Event beforeSend:', event.event_id);
    return event;
  },
  beforeSendTransaction(event: Sentry.TransactionEvent) {
    console.log('Transaction beforeSend:', event.event_id);
    return event;
  },
  beforeSendMetric: (metric: Sentry.Metric) => {
    console.log('Metric beforeSend:', metric.name, metric.value);
    return metric;
  },
  enableMetrics: true,
  // This will be called with a boolean `didCallNativeInit` when the native SDK has been contacted.
  onReady: ({ didCallNativeInit }) => {
    console.log('onReady called with didCallNativeInit:', didCallNativeInit);
  },
  integrations(integrations) {
    integrations.push(
      Sentry.httpClientIntegration({
        // These options are effective only in JS.
        // This array can contain tuples of `[begin, end]` (both inclusive),
        // Single status codes, or a combinations of both.
        // default: [[500, 599]]
        failedRequestStatusCodes: [[400, 599]],
        // This array can contain Regexes or strings, or combinations of both.
        // default: [/.*/]
        failedRequestTargets: [/.*/],
      }),
      navigationIntegration,
      Sentry.reactNativeTracingIntegration(),
      Sentry.mobileReplayIntegration({
        maskAllImages: true,
        maskAllText: true,
        maskAllVectors: true,
      }),
      Sentry.browserReplayIntegration({
        maskAllInputs: true,
        maskAllText: true,
      }),
      Sentry.feedbackIntegration({
        enableScreenshot: true,
        enableTakeScreenshot: true,
        imagePicker: ImagePicker,
        buttonOptions: {
          styles: {
            triggerButton: {
              marginBottom: 40, // Place the feedback button above the tab bar
            },
          },
        },
      }),
    );
    return integrations.filter(i => i.name !== 'Dedupe');
  },
  enableAutoSessionTracking: true,
  // For testing, session close when 5 seconds (instead of the default 30) in the background.
  sessionTrackingIntervalMillis: 5000,
  tracesSampleRate: 1.0,
  tracePropagationTargets: ['localhost', /^\//, /^https:\/\//, /^http:\/\//],
  attachStacktrace: true,
  // Attach screenshots to events.
  attachScreenshot: true,
  // Attach view hierarchy to events.
  attachViewHierarchy: true,
  // Enables capture failed requests in JS and native.
  enableCaptureFailedRequests: true,
  // Sets the `release` and `dist` on Sentry events. Make sure this matches EXACTLY with the values on your sourcemaps
  // otherwise they will not work.
  // release: 'myapp@1.2.3+1',
  // dist: `1`,
  profilesSampleRate: 1.0,
  // replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 1.0,
  spotlight: true,
});

function RootLayout() {
  const ref = useNavigationContainerRef();

  useEffect(() => {
    if (ref) {
      navigationIntegration.registerNavigationContainer(ref);
    }
  }, [ref]);

  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}

// export default withSentryPlayground(Sentry.wrap(RootLayout), {
//   projectId: '5428561',
//   organizationSlug: 'sentry-sdks',
// });

export default Sentry.wrap(RootLayout);
