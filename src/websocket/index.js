const ws = require('uWebSockets.js')

const MissingConfigError = require('../errors/MissingConfigError')
const adapterRegistry = require('../adapterRegistry')

const WebsocketServer = require('./WebsocketServer')

adapterRegistry.register('ws', ({ port, privateKeyFileName, certFileName, pingInterval }, {
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
        subscriptionManager,
        pingInterval
    )
    return () => {
        websocketServer.close()
    }
})
