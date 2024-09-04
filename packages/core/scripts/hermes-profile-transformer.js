const { writeFileSync } = require('fs');

const transformer = require('hermes-profile-transformer').default;

const hermesCpuProfilePath = 'iOS_release_profile.json';
const sourceMapPath = './main.jsbundle.map';
const sourceMapBundleFileName = 'main.jsbundle';

transformer(
  // profile path is required
  hermesCpuProfilePath,
  // source maps are optional
  sourceMapPath,
  sourceMapBundleFileName
)
  .then(events => {
    // write converted trace to a file
    return writeFileSync(
      './chrome-supported.json',
      JSON.stringify(events, null, 2),
      'utf-8'
    );
  })
  .catch(err => {
    console.log(err);
  });
