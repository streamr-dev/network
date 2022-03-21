// Loads non-browser compatible components to Electron's NodeJS sandbox during tests
process.once("loaded", () => {
    let WebSocket = require('ws')
    let Express = require('express')
    let HTTP = require('http')
    let HTTPS = require('https')
    // import * as tracker from

    window['streamr-network-tracker'] = require('streamr-network-tracker')
    window.WebSocket = WebSocket
    window.Express = Express
    window.HTTP = HTTP
    window.HTTPS = HTTPS
    // eslint-disable-next-line no-underscore-dangle
    window._streamr_electron_test = true
    console.log(window)
})
