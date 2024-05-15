// Loads non-browser compatible components to Electron's NodeJS sandbox during tests

process.once('loaded', () => {
    
    const nodeDataChannel = require('node-datachannel')
    
    window.NodeDataChannel = {
        WebSocketServer: nodeDataChannel.WebSocketServer,
        WebSocket: nodeDataChannel.WebSocket
    }

    window.Express = require('express')
    window.HTTP = require('http')
    window.HTTPS = require('https')
    window.Buffer = require('buffer/').Buffer
    window.QueryString = require('querystring')
    // maybe we can set this karma-setup
    // eslint-disable-next-line no-underscore-dangle
    window._streamr_electron_test = true
})
