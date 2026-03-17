import { StackNavigationProp } from '@react-navigation/stack';
import * as Sentry from '@sentry/react-native';
import { withSentryPlayground } from '@sentry/react-native/playground';
import { SafeAreaView } from 'react-native';

interface Props {
  navigation: StackNavigationProp<any, 'SDKPlaygroundScreen'>;
}

const BundledPlaygroundScreen = withSentryPlayground(
  Sentry.withProfiler((_: Props) => {
    return <SafeAreaView />;
  }),
);

export default BundledPlaygroundScreen;
