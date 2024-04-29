#!/bin/bash
set -eux

cd samples/react-native
yarn set-version $1
cd ../..

cd samples/expo
yarn set-version $1
cd ../..
