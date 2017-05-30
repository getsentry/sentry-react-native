function codePushPlugin(Raven, options, Sentry) {
  let codepush;
  try {
    codepush = require('react-native-code-push');
  } catch (e) {
    return;
  }

  codepush.getUpdateMetadata().then((update) => {
    if (update) {
      Sentry._setInternalOption('version', 'codepush:' + update.label);
    }
  });
}

module.exports = codePushPlugin;
