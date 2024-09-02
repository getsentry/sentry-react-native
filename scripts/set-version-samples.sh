#!/bin/bash
set -eux

cd samples/react-native
yarn set-version
cd ../..

cd samples/expo
yarn set-version
cd ../..
