#!/usr/bin/env node

const fs = require('fs');
const { argv } = require('process');

const parseArgs = require('minimist');
const { debug } = require('@sentry/core');
debug.enable();

const args = parseArgs(argv.slice(2));
if (!args.podspec) {
  throw new Error('Missing --podspec');
}

// The reason behind this patch is that the boost podspec is pointing to an archive with the wrong hashsum.
// The official workaround is to patch the URL as described here:
// https://github.com/facebook/react-native/issues/42180

debug.log('Patching Boost podspec: ', args.podspec);

let content = fs.readFileSync(args.podspec, 'utf8');
content = content.replace(
  "https://boostorg.jfrog.io/artifactory/main/release/1.76.0/source/boost_1_76_0.tar.bz2",
  "https://archives.boost.io/release/1.76.0/source/boost_1_76_0.tar.bz2"
);
fs.writeFileSync(args.podspec, content);

debug.log('Patched Boost podspec successfully!');
