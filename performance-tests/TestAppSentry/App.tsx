/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import { View } from 'react-native';
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://1df17bd4e543fdb31351dee1768bb679@o447951.ingest.sentry.io/5428561',
});

function App() {
  return (
    <View />
  );
}

export default Sentry.wrap(App);