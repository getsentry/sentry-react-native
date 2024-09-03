#!/bin/bash

cp $(dirname "$0")/../../../README.md $(dirname "$0")/../README.md

npm pack
