// Loads non-browser compatible components to Electron's NodeJS sandbox during tests

process.once("loaded", () => {
    window.StreamrNetworkTracker = require('@streamr/network-tracker')
    window.NodeJsWsServer = require('websocket').server
    window.WebSocket = require('ws')
    window.Express = require('express')
    window.HTTP = require('http')
    window.HTTPS = require('https')
    window.NodeJsBuffer = Buffer
    window.Buffer = require('buffer/').Buffer
    // maybe we can set this karma-setup
    // eslint-disable-next-line no-underscore-dangle
    window._streamr_electron_test = true
})
