const process = require('process');
const fs = require('fs');

console.log('Copy `debugId` from packager source map to Hermes source map...');

const packagerSourceMapPath = process.argv[2];
const hermesSourceMapPath = process.argv[3];

if (!packagerSourceMapPath) {
  console.log('Please provide packager source map path (A path to copy `debugId` from).');
  process.exit(0);
}
if (!hermesSourceMapPath) {
  console.log('Please provide Hermes source map path. ((A path to copy `debugId` to))');
  process.exit(0);
}
if (!fs.existsSync(packagerSourceMapPath)) {
  console.log('Packager source map path (A path to copy `debugId` from).');
  process.exit(0);
}
if (!fs.existsSync(hermesSourceMapPath)) {
  console.log('Hermes source map not found. ((A path to copy `debugId` to))');
  process.exit(0);
}

const from = fs.readFileSync(process.argv[2], 'utf8');
const to = fs.readFileSync(process.argv[3], 'utf8');

const fromParsed = JSON.parse(from);
const toParsed = JSON.parse(to);

if (!fromParsed.debugId && !fromParsed.debug_id) {
  console.log('Packager source map does not have `debugId`.');
  process.exit(0);
}

if (toParsed.debugId || toParsed.debug_id) {
  console.log('Hermes combined source map already has `debugId`.');
  process.exit(0);
}

if (fromParsed.debugId) {
  toParsed.debugId = fromParsed.debugId;
  toParsed.debug_id = fromParsed.debugId;
} else if (fromParsed.debug_id) {
  toParsed.debugId = fromParsed.debug_id;
  toParsed.debug_id = fromParsed.debug_id;
}

fs.writeFileSync(process.argv[3], JSON.stringify(toParsed));

console.log('Done.');
