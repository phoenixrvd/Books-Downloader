#!/usr/bin/env sh

PATH_CURRENT="$(cwd)"
PATH_SCRIPT="$( cd "$(dirname "$0")" ; pwd -P )"
PATH_DIST=$PATH_SCRIPT/audioknigi_donloader.zip

cd $PATH_SCRIPT/extension
zip -rFSD $PATH_DIST *
cd $PATH_CURRENT
