const fs = require('fs')
const https = require('https')

const ws = require('ws')

const MissingConfigError = require('../errors/MissingConfigError')
const adapterRegistry = require('../adapterRegistry')

const WebsocketServer = require('./WebsocketServer')

adapterRegistry.register('ws', ({ port, privateKeyFileName, certFileName }, {
    networkNode, publisher, streamFetcher, volumeLogger, subscriptionManager
}) => {
    if (port === undefined) {
        throw new MissingConfigError('port')
    }
    const serverConfig = {
        path: '/api/v1/ws',
    }
    let server
    if (privateKeyFileName && certFileName) {
        server = https.createServer({
            cert: fs.readFileSync(certFileName),
            key: fs.readFileSync(privateKeyFileName)
        })
        serverConfig.server = server
        server.listen(port)
    } else {
        serverConfig.port = port
    }
    const websocketServer = new WebsocketServer(
        new ws.Server(serverConfig).on('listening', () => console.info(`WS adapter listening on ${port}`)),
        networkNode,
        streamFetcher,
        publisher,
        volumeLogger,
        subscriptionManager
    )
    return () => {
        websocketServer.close()
        if (server) {
            server.close()
        }
    }
})
