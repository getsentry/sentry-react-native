const replace = require('replace-in-file');

const pjson = require('../package.json');

replace({
  files: ['src/js/version.ts'],
  from: /\d+\.\d+.\d+(?:-\w+(?:\.\w+)?)?/g,
  to: pjson.version,
})
  .then(matchedFiles => {
    console.log(
      'Modified files:',
      matchedFiles
        .filter(file => file.hasChanged)
        .map(file => file.file)
        .join(', ') || 'none',
    );
  })
  .catch(error => {
    console.error('Error occurred:', error);
  });
