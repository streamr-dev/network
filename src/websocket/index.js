const fs = require('fs')
const https = require('https')

const ws = require('uWebSockets.js')

const MissingConfigError = require('../errors/MissingConfigError')
const adapterRegistry = require('../adapterRegistry')

const WebsocketServer = require('./WebsocketServer')

adapterRegistry.register('ws', ({ port, privateKeyFileName, certFileName }, {
    networkNode, publisher, streamFetcher, volumeLogger, subscriptionManager
}) => {
    if (port === undefined) {
        throw new MissingConfigError('port')
    }

    let server
    if (privateKeyFileName && certFileName) {
        server = ws.SSLApp({
            key_file_name: privateKeyFileName,
            cert_file_name: certFileName,

        })
    } else {
        server = ws.App()
    }
    const websocketServer = new WebsocketServer(
        server,
        port,
        networkNode,
        streamFetcher,
        publisher,
        volumeLogger,
        subscriptionManager
    )
    return () => {
        websocketServer.close()
    }
})
