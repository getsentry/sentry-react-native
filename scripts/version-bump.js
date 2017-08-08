const replace = require('replace-in-file');
const pjson = require('../package.json');

replace({
  files: ['ios/RNSentry.m', 'android/src/main/java/io/sentry/RNSentryModule.java'],
  from: /\d+\.\d+.\d+/g,
  to: pjson.version
})
  .then(changedFiles => {
    console.log('Modified files:', changedFiles.join(', '));
  })
  .catch(error => {
    console.error('Error occurred:', error);
  });
