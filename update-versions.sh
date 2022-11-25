#!/bin/bash
if [[ "$1" == "" ]]; then
    echo 'usage: update-versions.sh <SEMVER>'
    exit 1
fi

PKG_DIRS="utils
test-utils
protocol
proto-rpc
dht
network
network-tracker
client
cli-tools
broker"

PKG_NAMES="@streamr/utils
@streamr/test-utils
@streamr/protocol
@streamr/proto-rpc
@streamr/dht
@streamr/network-node
@streamr/network-tracker
streamr-client
@streamr/cli-tools
"


# Update package versions
for pkg in $PKG_DIRS
do
    tmp=$(mktemp)
    if [[ "$pkg" != "broker" ]]; then
        jq ".version=\"$1\"" packages/$pkg/package.json > $tmp
    else
        cat packages/$pkg/package.json > $tmp
    fi
    for dep in $PKG_NAMES
    do
        tmp2=$(mktemp)
        jq "if .dependencies.\"$dep\"? then .dependencies.\"$dep\"=\"$1\" else . end" $tmp > $tmp2
        tmp3=$(mktemp)
        jq "if .devDependencies.\"$dep\"? then .devDependencies.\"$dep\"=\"$1\" else . end" $tmp2 > $tmp3
        mv $tmp3 $tmp
    done
    mv $tmp packages/$pkg/package.json
done
