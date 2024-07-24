# expects `$repo`, `$tagPrefix` and `$packages` (array) variables to be defined, see e.g. update-javascript.sh

file="$(dirname "$0")/../package.json"
content=$(cat $file)

case $1 in
get-version)
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
        cd "$(dirname "$file")"
        yarn upgrade --non-interactive $list
    )
    ;;
*)
    echo "Unknown argument $1"
    exit 1
    ;;
esac
