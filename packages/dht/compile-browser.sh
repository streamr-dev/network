#!/bin/bash

# Compile the browser version of the source code for webpacking as a part of a larger build process
npx tsc -b tsconfig.compile-browser.json             

# Remove the NodeWebsocketClientConnection and NodeWebrtcConnection files from dist
# as they crash the browser when loading the webpacked bundle

rm dist/src/connection/websocket/NodeWebsocketClientConnection.*
rm dist/src/connection/webrtc/NodeWebrtcConnection.*
