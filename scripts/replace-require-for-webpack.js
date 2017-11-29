const replace = require('replace-in-file');

replace({
  files: ['lib/raven-plugin.js'],
  from: 'promise/setimmediate/rejection-tracking',
  to:
    '../examples/react-native/AwesomeProject/node_modules/promise/setimmediate/rejection-tracking'
})
  .then(changedFiles => {
    console.log('Modified files:', changedFiles.join(', '));
  })
  .catch(error => {
    console.error('Error occurred:', error);
  });
