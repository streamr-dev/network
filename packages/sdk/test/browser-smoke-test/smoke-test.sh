#!/bin/bash
cd "$(dirname "$0")"
npm run build
node server.js &
pid=$!
../../../../node_modules/.bin/nightwatch --headless --verbose --timeout=30000 --config=nightwatch.conf.js browser.js
kill $pid
