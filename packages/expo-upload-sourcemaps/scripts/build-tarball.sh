#!/bin/bash

rm -f $(dirname "$0")/../*.tgz

npm pack
