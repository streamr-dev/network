// Loads non-browser compatible components to Electron's NodeJS sandbox during tests

process.once("loaded", () => {
    window.NodeJsWsServer = require('websocket').server
    window.Express = require('express')
    window.HTTP = require('http')
    window.HTTPS = require('https')
    window.NodeJsBuffer = Buffer
    // maybe we can set this karma-setup
    window._streamr_electron_test = true
})
