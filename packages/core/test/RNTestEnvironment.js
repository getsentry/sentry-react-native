/* eslint-disable @typescript-eslint/no-unsafe-member-access */
const ReactNativeEnv = require('react-native/jest/react-native-env');

// Extends the `react-native` preset's test environment but drops the `react-native` export
// condition. Since v10.58.0 the JS SDK packages expose a `react-native` condition pointing at
// their ESM build; resolving it makes Jest load untransformed ESM. Dropping it makes them resolve
// to their CJS builds (via the `require` condition), restoring the pre-10.58.0 behaviour.
module.exports = class extends ReactNativeEnv {
  customExportConditions = ['require'];
};
