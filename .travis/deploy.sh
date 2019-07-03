#!/bin/sh
set -e
npm run build
npm pack
mkdir -p build
