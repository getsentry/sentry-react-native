const process = require('process');
const fs = require('fs');

const sourceMapPath = process.argv[2];

if (!sourceMapPath) {
  console.log('Add source map path as first argument of the script.');
  process.exit(1);
}

if (!fs.existsSync(sourceMapPath)) {
  console.log(`${sourceMapPath} does not exist.`);
  process.exit(1);
}

let sourceMap;
try {
  sourceMap = JSON.parse(fs.readFileSync(sourceMapPath, 'utf8'));
} catch (e) {
  console.log(`Sourcemap at ${sourceMapPath} was unable to be read.`, e);
  process.exist(1);
}

if (typeof sourceMap.debugId === 'string' && sourceMap.debugId.length > 0) {
  console.log(sourceMap.debugId);
} else if (typeof sourceMap.debug_id === 'string' && sourceMap.debug_id.length > 0) {
  console.log(sourceMap.debug_id);
} else {
  console.log(`${sourceMapPath} does not contain 'debugId' nor 'debug_id'.`);
  process.exist(1);
}
