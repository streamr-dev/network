#!/bin/bash

# move to the directory where this script is located so that we can use relative paths
cd "${0%/*}"

trap stop_applications SIGINT

stop_applications(){
    pkill -TERM -P $$ 
}

run_application() {
    # use AWK to transform the output:
    # - colorize lines: use line-specific color for errors and warnings, otherwise application-specific color
    # - abbreviate log level to one character (otherwise messages don't align as e.g. "error" is a longer word than "info")
    (cd ../packages/$1 && chmod +x $2 && STREAMR_APPLICATION_ID=$3 LOG_COLORS=false $2 $5 $6 $7) | awk -v default_color=$4 ' BEGIN { color = default_color }
        /^ERROR/ { color = "255;0;0" }
        /^WARN/ { color = "255;255;0" }
        { print "\033[38;2;" color "m" substr($0, 1, 1) substr($0, index($0, " "), length($0)); color = default_color }'
}

run_application broker ./dist/bin/run-entry-point.js &

wait 
