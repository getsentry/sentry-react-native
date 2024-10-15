#!/bin/bash

rm -f $(dirname "$0")/../*.tgz

cp $(dirname "$0")/../../../README.md $(dirname "$0")/../README.md

npm pack
