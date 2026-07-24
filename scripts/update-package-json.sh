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
    # Only first-party @sentry/* packages are safe to adopt immediately (see below).
    allFirstParty=true
    for i in ${!packages[@]}; do
        list+="${packages[$i]}@$version "
        if [[ "${packages[$i]}" != @sentry/* ]]; then
            allFirstParty=false
        fi
    done
    (
        cd "${monorepoRoot}"
        # The updater's job is to adopt the just-published version immediately, but
        # Yarn 4's npmMinimalAgeGate (default 1 day, auto-enabled on CI) quarantines a
        # fresh release and fails `yarn up`. For first-party @sentry/* packages there's
        # no supply-chain risk, so disable the gate. Third-party packages (e.g.
        # react-native via update-rn.sh) keep the gate.
        if [[ "$allFirstParty" == true ]]; then
            export YARN_NPM_MINIMAL_AGE_GATE=0
        fi
        yarn up $list
    )
    ;;
*)
    echo "Unknown argument $1"
    exit 1
    ;;
esac
