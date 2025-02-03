const replace = require('replace-in-file');

// Root package.json doesn't have a version field, so we need to read it from the core package.json
const pjson = require('../packages/core/package.json');

replace({
  files: [
    'packages/core/src/js/version.ts',
    'packages/core/android/src/main/java/io/sentry/react/RNSentryVersion.java',
    'packages/core/ios/RNSentryVersion.m',
  ],
  from: /\d+\.\d+.\d+(?:-\w+(?:\.\w+)?)?/g,
  to: pjson.version,
})
  .then(matchedFiles => {
    const modifiedFiles =
      matchedFiles
        .filter(file => file.hasChanged)
        .map(file => file.file)
        .join(', ') || 'none';
    console.log('Modified files:', modifiedFiles);
  })
  .catch(error => {
    console.error('Error occurred:', error);
  });
