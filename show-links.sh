#!/bin/bash

# Go through packages and for each enumerate the node_modules that are symlinked

TITLE_COLOR='\033[0;36m'
NO_COLOR='\033[0m'

LIST_CMD=`npx lerna list --all --parseable | xargs -L1 basename`
PACKAGES=()
while IFS= read -r line; do
    PACKAGES+=("$line")
done < <(echo $LIST_CMD)

for p in $PACKAGES
do
    RES=`(cd packages/$p && find node_modules -maxdepth 1 -type l) | sed 's/^/\t/'`
    if [ -z "$RES" ]
    then
        printf "${TITLE_COLOR}$p${NO_COLOR}\n" # here to avoid extra newline
    else
        printf "${TITLE_COLOR}$p${NO_COLOR}\n${RES}\n"
    fi
done
