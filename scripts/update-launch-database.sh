#!/usr/bin/env bash
set -euo pipefail

lsregister=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
simulatorApp=/Applications/Xcode.app/Contents/Developer/Applications/Simulator.app

$lsregister -f $simulatorApp
