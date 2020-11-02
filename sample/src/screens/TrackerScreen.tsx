import * as React from 'react';
import {Button, View, StyleSheet, Text, ActivityIndicator} from 'react-native';

import * as Sentry from '@sentry/react-native';

const TrackerScreen = () => {
  const [cases, setCases] = React.useState<{
    TotalConfirmed: number;
    TotalDeaths: number;
    TotalRecovered: number;
  } | null>(null);

  const transaction = React.useRef(null);

  React.useEffect(() => {
    // Initialize the transaction for the screen.
    transaction.current = Sentry.startTransaction({
      description: 'Tracker Screen',
    });

    return () => {
      transaction.current?.finish();
      transaction.current = null;
    };
  }, []);

  const loadData = () => {
    setCases(null);

    // Create a child span for the API call.
    const span = transaction.current?.startChild({
      op: 'http',
      name: 'fetch',
      description: 'Fetch Covid19 data from API',
    });

    fetch('https://api.covid19api.com/world/total', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    })
      .then((response) => response.json())
      .then((json) => {
        setCases(json);

        span?.setData('json', json);
        span?.finish();
      });
  };

  React.useEffect(() => {
    loadData();
  }, []);

  return (
    <View style={styles.screen}>
      <View style={styles.titleContainer}>
        <Text style={styles.title}>Global COVID19 Cases</Text>
      </View>
      <View style={styles.card}>
        {cases ? (
          <>
            <Statistic
              title="Confirmed"
              count={cases.TotalConfirmed}
              textColor="#C83852"
            />
            <Statistic
              title="Deaths"
              count={cases.TotalDeaths}
              textColor="#362D59"
            />
            <Statistic
              title="Recovered"
              count={cases.TotalRecovered}
              textColor="#69C289"
            />
          </>
        ) : (
          <ActivityIndicator size="small" color="#F6F6F8" />
        )}
      </View>
      <Button title="Refresh" onPress={loadData} />
    </View>
  );
};

const Statistic = (props: {
  title: string;
  count: number;
  textColor: string;
}): React.ReactElement => {
  return (
    <View style={styles.statisticContainer}>
      <Text>{props.title}</Text>
      <Text style={[styles.statisticCount, {color: props.textColor}]}>
        {`${props.count}`.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,')}
      </Text>
    </View>
  );
};

export default TrackerScreen;

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
  card: {
    width: '100%',
    height: 240,
    padding: 12,
    borderWidth: 1,
    borderColor: '#79628C',
    borderRadius: 6,
    backgroundColor: '#F6F6F8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statisticContainer: {
    width: '100%',
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statisticTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  statisticCount: {
    fontSize: 16,
    fontWeight: '700',
  },
});
