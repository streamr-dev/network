// Loads non-browser compatible components to Electron's NodeJS sandbox during tests
process.once("loaded", () => {
    //window.StreamrNetworkTracker = require('@streamr/network-tracker')
    window.websocket = require('websocket')
    //window.WsServer =  require('websocket.server')
    window.Express = require('express')
    window.HTTP = require('http')
    window.HTTPS = require('https')
    window.NodeJsBuffer = Buffer
    // eslint-disable-next-line no-underscore-dangle
    window._streamr_electron_test = true
})
