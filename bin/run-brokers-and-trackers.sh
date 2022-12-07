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
    (cd ../packages/$2 && STREAMR_APPLICATION_ID=$3 LOG_COLORS=false npm exec $1 -- $5 $6 $7) | awk -v default_color=$4 ' BEGIN { color = default_color }
        /^ERROR/ { color = "255;0;0" }
        /^WARN/ { color = "255;255;0" }
        { print "\033[38;2;" color "m" substr($0, 1, 1) substr($0, index($0, " "), length($0)); color = default_color }'
}

run_application streamr-tracker network-tracker T1 '102;204;102' 0xe5abc5ee43b8830e7b0f98d03efff5d6cae574d52a43204528eab7b52cd6408d T1 --port=30301 &
run_application streamr-tracker network-tracker T2 '0;255;102' 0x96de9d06f9e409119a2cd9b57dfc326f66d953a0418f3937b92c8930f930893c T2 --port=30302 &
run_application streamr-tracker network-tracker T3 '102;255;170' 0x6117b7a7cb8f3c8d40e3b7e87823c11af7f401515bc4fdf2bfdda70f1b833027 T3 --port=30303 &

run_application streamr-broker broker S1 '136;136;255' configs/development-1.env.json &
run_application streamr-broker broker B1 '0;136;255' configs/development-2.env.json &
run_application streamr-broker broker B2 '136;204;255' configs/development-3.env.json &

wait 
