# expects `$repo`, `$tagPrefix` and `$packages` (array) variables to be defined, see e.g. update-javascript.sh

# Since Corepack is not going to be distributed with Node.js v25+ in the future we need to install Corepack globally.
# See: https://github.com/getsentry/sentry-react-native/pull/4741
corepack enable # This repository uses Yarn v3 which requires corepack to be enabled

monorepoRoot="$(dirname "$0")/.."

case $1 in
get-version)
    file="$(dirname "$0")/../packages/core/package.json"
    content=$(cat $file)
    regex='"'${packages[0]}'": *"([0-9.]+)"'
    if ! [[ $content =~ $regex ]]; then
        echo "Failed to find plugin '${packages[0]}' version in $file"
        exit 1
    fi
    echo $tagPrefix${BASH_REMATCH[1]}
    ;;
get-repo)
    echo $repo
    ;;
set-version)
    list=""
    version="$2"
    # remove $tagPrefix from the $version by skipping the first `strlen($tagPrefix)` characters
    if [[ "$version" == "$tagPrefix"* ]]; then
        version="${version:${#tagPrefix}}"
    fi
    for i in ${!packages[@]}; do
        list+="${packages[$i]}@$version "
    done
    (
        cd "${monorepoRoot}"
        yarn up $list
    )
    ;;
*)
    echo "Unknown argument $1"
    exit 1
    ;;
esac
