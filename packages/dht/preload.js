// Loads non-browser compatible components to Electron's NodeJS sandbox during tests
process.once("loaded", () => {
    window.NodeJsWsServer = require('websocket').server
    window.Express = require('express')
    window.HTTP = require('http')
    window.HTTPS = require('https')
    window.NodeJsBuffer = Buffer
    // eslint-disable-next-line no-underscore-dangle
    window._streamr_electron_test = true
})
