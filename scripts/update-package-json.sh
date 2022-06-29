# expects $repo & $packages (array) variables to be defined

file="$(dirname "$0")/../package.json"
content=$(cat $file)

case $1 in
get-version)
    regex='"'${packages[0]}'": *"([0-9.]+)"'
    if ! [[ $content =~ $regex ]]; then
        echo "Failed to find the plugin version in $file"
        exit 1
    fi
    echo ${BASH_REMATCH[1]}
    ;;
get-repo)
    echo $repo
    ;;
set-version)
    list=""
    for i in ${!packages[@]}; do
        list+="${packages[$i]}@$2 "
        # yarn upgrade --non-interactive "@sentry/${packages[$i]}@$2"
    done
    yarn upgrade --non-interactive $list
    ;;
*)
    echo "Unknown argument $1"
    exit 1
    ;;
esac
