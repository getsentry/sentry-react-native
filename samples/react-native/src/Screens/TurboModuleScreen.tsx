import React from 'react';
import {
  ButtonProps,
  Button as NativeButton,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { StackNavigationProp } from '@react-navigation/stack';
import { spanToJSON, startNewTrace } from '@sentry/core';
import * as Sentry from '@sentry/react-native';

import NativePlatformSampleModule from '../../tm/NativePlatformSampleModule';
import NativeSampleModule from '../../tm/NativeSampleModule';
import { TimeToFullDisplay, logWithoutTracing } from '../utils';

/**
 * Name of the manual root span wrapping the TurboModule calls. The e2e test
 * waits for a transaction with this name and asserts the `turbo_module.*`
 * attributes the `TurboModuleContext` integration attaches to it.
 */
export const TURBO_MODULE_SPAN_NAME = 'turbo_module.sample';

const SYNC_CALL_COUNT = 5;
const ATTRIBUTE_PREFIX = 'turbo_module.';

interface Props {
  navigation: StackNavigationProp<any, 'TurboModuleScreen'>;
}

const isNewArchitecture = !!NativeSampleModule && !!NativePlatformSampleModule;

function collectTurboModuleAttributes(span: Sentry.Span): string[] {
  const data = spanToJSON(span).data ?? {};
  return Object.keys(data)
    .filter(key => key.startsWith(ATTRIBUTE_PREFIX))
    .sort()
    .map(key => `${key}: ${String(data[key])}`);
}

const TurboModuleScreen = (_props: Props) => {
  const [status, setStatus] = React.useState('Idle');
  const [addResult, setAddResult] = React.useState('not called');
  const [platformResult, setPlatformResult] = React.useState('not called');
  const [attributes, setAttributes] = React.useState<string[]>([]);
  const [nativeError, setNativeError] = React.useState('none');

  const runCalls = React.useCallback(async () => {
    if (!isNewArchitecture) {
      setStatus(
        'TurboModules unavailable. Build the app with the New Architecture enabled.',
      );
      return;
    }

    setStatus('Running');
    setAttributes([]);

    // A dedicated trace keeps the measured window free of unrelated navigation
    // spans, so the attached `turbo_module.*` attributes describe only these calls.
    try {
      await startNewTrace(async () => {
        await Sentry.startSpanManual(
          {
            name: TURBO_MODULE_SPAN_NAME,
            op: 'ui.action',
            forceTransaction: true,
          },
          async (span: Sentry.Span) => {
            let sum = 0;
            for (let index = 1; index <= SYNC_CALL_COUNT; index++) {
              // Synchronous C++ TurboModule call.
              sum = NativeSampleModule!.add(sum, index);
            }
            setAddResult(`add x${SYNC_CALL_COUNT} = ${sum}`);

            // Asynchronous platform TurboModule call.
            const platform = await NativePlatformSampleModule!.getPlatform();
            setPlatformResult(`getPlatform = ${platform}`);

            span.end();

            // Safe to read right after `end()`: `SentrySpan.end()` emits
            // `spanEnd` — where the TurboModuleContext integration writes the
            // attributes — before it seals the span, and spans created through
            // the core span API are never sealed. Covered by
            // `packages/core/test/integrations/turboModuleContext.spans.test.ts`.
            const collected = collectTurboModuleAttributes(span);
            setAttributes(collected);
            // Also log so the numbers are greppable from the device logs.
            logWithoutTracing('[TurboModule] span attributes:', collected);
            setStatus('Done');
          },
        );
      });
    } catch (error) {
      setStatus(`Failed: ${String(error)}`);
    }
  }, []);

  const captureNativeThrow = React.useCallback((kind: 'cxx' | 'platform') => {
    if (!isNewArchitecture) {
      setStatus(
        'TurboModules unavailable. Build the app with the New Architecture enabled.',
      );
      return;
    }

    try {
      if (kind === 'cxx') {
        NativeSampleModule!.crash();
      } else {
        NativePlatformSampleModule!.crashOrString();
      }
      setNativeError('native call did not throw');
    } catch (error) {
      const eventId = Sentry.captureException(error);
      setNativeError(`captured ${kind} throw as ${eventId}`);
    }
  }, []);

  return (
    <>
      <StatusBar barStyle="dark-content" />
      <ScrollView style={styles.mainView}>
        <TimeToFullDisplay record={true} />
        <Text style={styles.title}>TurboModule Playground</Text>
        <Text style={styles.description}>
          Exercises the sample TurboModules and shows the `turbo_module.*` span
          attributes produced by the TurboModuleContext integration.
        </Text>
        <Button title="Run TurboModule calls" onPress={runCalls} />
        <Button
          title="Throw from native Cxx"
          onPress={() => captureNativeThrow('cxx')}
        />
        <Button
          title="Throw from native platform"
          onPress={() => captureNativeThrow('platform')}
        />
        <Spacer />
        <Text style={styles.sectionTitle}>Results</Text>
        <Text testID="turbo-module-status">Status: {status}</Text>
        <Text testID="turbo-module-add-result">Sync: {addResult}</Text>
        <Text testID="turbo-module-platform-result">
          Async: {platformResult}
        </Text>
        <Text testID="turbo-module-native-error">Throw: {nativeError}</Text>
        <Spacer />
        <Text style={styles.sectionTitle}>Span attributes</Text>
        <View testID="turbo-module-attributes">
          {attributes.length === 0 ? (
            <Text>no attributes recorded yet</Text>
          ) : (
            attributes.map(attribute => (
              <Text key={attribute} style={styles.attribute}>
                {attribute}
              </Text>
            ))
          )}
        </View>
        <View style={styles.mainViewBottomWhiteSpace} />
      </ScrollView>
    </>
  );
};

const Button = (props: ButtonProps) => (
  <>
    <NativeButton {...props} color="#6C5FC7" />
    <View style={styles.buttonSpacer} />
  </>
);

const Spacer = () => <View style={styles.spacer} />;

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#362D59',
    marginBottom: 8,
  },
  description: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#362D59',
    marginBottom: 8,
  },
  attribute: {
    fontFamily: 'Courier',
    fontSize: 12,
  },
  buttonSpacer: {
    marginBottom: 8,
  },
  spacer: {
    height: 1,
    width: '100%',
    backgroundColor: '#c6becf',
    marginBottom: 16,
    marginTop: 8,
  },
  mainView: {
    padding: 20,
  },
  mainViewBottomWhiteSpace: {
    marginTop: 32,
  },
});

export default Sentry.withProfiler(TurboModuleScreen);
