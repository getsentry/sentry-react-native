import { StyleSheet } from 'react-native';
import * as Sentry from '@sentry/react-native';

import EditScreenInfo from '@/components/EditScreenInfo';
import { Text, View } from '@/components/Themed';

export default function TabTwoScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tab Two</Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      <Sentry.Unmask>
        <Text>This is unmasked because it's direct child of Sentry.Unmask (can be masked if Sentry.Masked is used higher in the hierarchy)</Text>
        <Sentry.Mask>
          <Text>This is masked always because it's a child of a Sentry.Mask</Text>
          <Sentry.Unmask>
            {/* Sentry.Unmask does not override the Sentry.Mask from above in the hierarchy */}
            <Text>This is masked always because it's a child of Sentry.Mask</Text>
          </Sentry.Unmask>
        </Sentry.Mask>
      </Sentry.Unmask>
      <EditScreenInfo path="app/(tabs)/two.tsx" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  separator: {
    marginVertical: 30,
    height: 1,
    width: '80%',
  },
});
