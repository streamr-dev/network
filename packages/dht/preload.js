// Loads non-browser compatible components to Electron's NodeJS sandbox during tests
window.process = {}
window.process.stdout = {}
process.once("loaded", () => {
    window.NodeJsWsServer = require('websocket').server
    window.Express = require('express')
    window.HTTP = require('http')
    window.HTTPS = require('https')
    window.NodeJsBuffer = Buffer
    window.process = {}
    window.process.stdout = {}
})
