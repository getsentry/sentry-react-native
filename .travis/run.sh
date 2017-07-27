#!/bin/sh
cd appium
bundle install
pip wheel --wheel-dir wheelhouse -r requirements.txt
make test
