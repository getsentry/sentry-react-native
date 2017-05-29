function codePushPlugin(Raven, options) {
  let codepush;
  try {
    codepush = require('react-native-code-push');
  } catch (e) {
    return;
  }

  codepush.getUpdateMetadata().then((update) => {
    if (update) {
      Raven.setDataCallback(function(data) {
        let extra = data.extra || (data.extra = {});
        extra.__sentryVersionOverride = 'codepush:' + update.label;
      });
    }
  });
}

module.exports = codePushPlugin;
