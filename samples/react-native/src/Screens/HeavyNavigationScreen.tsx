import * as React from 'react';
import { Button, View, StyleSheet, Text, ScrollView } from 'react-native';

import * as Sentry from '@sentry/react-native';
import { StackNavigationProp } from '@react-navigation/stack';

interface Props {
  navigation: StackNavigationProp<any, 'HeavyNatigavionScreen'>;
  route?: {
    params?: {
      manualTrack: boolean;
    };
  };
}
const buttonTitles = Array.from(
  { length: 500 },
  (_, index) => `Sample button ${index + 1}`,
);

/**
 * this page takes around 300ms to initially display, we navigate to another page in 100ms.
 * The time to initial display will never be finished on this page.
 */
const HeavyNavigationScreen = (props: Props) => {
  const content = (
    <ScrollView style={styles.screen}>
      <View style={styles.titleContainer}>
        <Text style={styles.title}>
          Heavy page only intended for navigating to another page while the page
          is loading.
        </Text>
      </View>
      {buttonTitles.map((title, index) => (
        <Button key={index} title={title} />
      ))}
    </ScrollView>
  );

  React.useEffect(() => {
    setTimeout(() => {
      props.navigation.goBack();
    }, 1);
  });
  return (
    <>
      {props.route?.params?.manualTrack ? (
        <Sentry.TimeToInitialDisplay record={true}>
          {content}
        </Sentry.TimeToInitialDisplay>
      ) : (
        content
      )}
    </>
  );
};

export default Sentry.withProfiler(HeavyNavigationScreen);

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 16,
  },
  titleContainer: {
    paddingBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
});
