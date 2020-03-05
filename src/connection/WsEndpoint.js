const events = Object.freeze({
    PEER_CONNECTED: 'streamr:peer:connect',
    PEER_DISCONNECTED: 'streamr:peer:disconnect',
    MESSAGE_RECEIVED: 'streamr:message-received'
})

const { EventEmitter } = require('events')
const url = require('url')

const createDebug = require('debug')
const WebSocket = require('@streamr/sc-uws')

const { disconnectionCodes, disconnectionReasons } = require('../messages/messageTypes')
const Metrics = require('../metrics')

const { PeerBook } = require('./PeerBook')
const { PeerInfo } = require('./PeerInfo')

function transformToObjectWithLowerCaseKeys(o) {
    const transformedO = {}
    Object.entries(o).forEach(([k, v]) => {
        transformedO[k.toLowerCase()] = v
    })
    return transformedO
}

// asObject
function toHeaders(peerInfo) {
    return {
        'streamr-peer-id': peerInfo.peerId,
        'streamr-peer-type': peerInfo.peerType
    }
}

function fromHeaders(headers) {
    const objectWithLowerCaseKeys = transformToObjectWithLowerCaseKeys(headers)
    return new PeerInfo(objectWithLowerCaseKeys['streamr-peer-id'], objectWithLowerCaseKeys['streamr-peer-type'])
}

class ReadyStateError extends Error {
    constructor(readyState) {
        super(`cannot send because socket.readyState=${readyState}`)
    }
}

class WsEndpoint extends EventEmitter {
    constructor(wss, peerInfo, advertisedWsUrl) {
        super()

        if (!wss) {
            throw new Error('wss not given')
        }
        if (!(peerInfo instanceof PeerInfo)) {
            throw new Error('peerInfo not instance of PeerInfo')
        }
        if (advertisedWsUrl === undefined) {
            throw new Error('advertisedWsUrl not given')
        }

        this.debug = createDebug(`streamr:connection:ws-endpoint:${peerInfo.peerId}`)

        this.wss = wss
        this.peerInfo = peerInfo
        this.advertisedWsUrl = advertisedWsUrl

        this.metrics = new Metrics('WsEndpoint')

        this.metrics.createSpeedometer('_inSpeed')
        this.metrics.createSpeedometer('_outSpeed')
        this.metrics.createSpeedometer('_msgSpeed')
        this.metrics.createSpeedometer('_msgInSpeed')
        this.metrics.createSpeedometer('_msgOutSpeed')

        this.connections = new Map()
        this.lastCheckedReadyState = new Map()
        this.pendingConnections = new Map()
        this.peerBook = new PeerBook()

        this.wss.on('connection', this._onIncomingConnection.bind(this))

        this.wss.verifyClient = (info) => {
            const parameters = url.parse(info.req.url, true)
            const { address } = parameters.query

            if (this.isConnected(address)) {
                this.debug('already connected to %s, readyState %d', address, this.connections.get(address).readyState)
                this.debug('closing existing socket')
                this.connections.get(address).close()
            }

            return true
        }

        // Attach custom headers to headers before they are sent to client
        this.wss.httpServer.on('upgrade', (request, socket, head) => {
            request.headers.extraHeaders = toHeaders(this.peerInfo)
        })

        this.debug('listening on: %s', this.getAddress())
        this.checkConnectionsInterval = setInterval(this._checkConnections.bind(this), 10 * 1000)
    }

    _checkConnections() {
        const addresses = [...this.connections.keys()]
        addresses.forEach((address) => {
            const ws = this.connections.get(address)

            if (ws.readyState !== 1) {
                const lastReadyState = this.lastCheckedReadyState.get(address)
                this.lastCheckedReadyState.set(address, ws.readyState)

                this.metrics.inc(`_checkConnections:readyState=${ws.readyState}`)
                console.error(`${this.getAddress()} => ${address} = ${ws.readyState}`)

                if (lastReadyState != null && lastReadyState === ws.readyState) {
                    try {
                        console.error('terminating connection...')
                        ws.terminate()
                    } catch (e) {
                        console.error('failed to close closed socket because of %s', e)
                    } finally {
                        this.lastCheckedReadyState.delete(address)
                    }
                }
            } else {
                this.lastCheckedReadyState.delete(address)
            }
        })
    }

    sendSync(recipientId, message) {
        const recipientAddress = this.resolveAddress(recipientId)
        if (!this.isConnected(recipientAddress)) {
            this.metrics.inc('send:failed:not-connected')
            this.debug('cannot send to %s because not connected', recipientAddress)
        } else {
            const ws = this.connections.get(recipientAddress)
            try {
                setImmediate(() => {
                    if (ws.readyState === ws.OPEN) {
                        this.metrics.speed('_outSpeed')(message.length)
                        this.metrics.speed('_msgSpeed')(1)
                        this.metrics.speed('_msgOutSpeed')(1)

                        ws.send(message, (err) => {
                            if (!err) {
                                this.metrics.inc('send:failed')
                            } else {
                                this.metrics.inc('send:success')
                                this.debug('sent to %s message "%s"', recipientAddress, message)
                            }
                        })
                    } else {
                        this.metrics.inc(`send:failed:readyState=${ws.readyState}`)
                        this.debug('sent failed because readyState of socket is %d', ws.readyState)
                    }
                }, 0)
            } catch (e) {
                this.metrics.inc('send:failed')
                console.error('sending to %s failed because of %s, readyState is', recipientAddress, e, ws.readyState)
                if (ws.readyState === 2 || ws.readyState === 3) {
                    ws.terminate()
                }
            }
        }
    }

    send(recipientId, message) {
        const recipientAddress = this.resolveAddress(recipientId)
        return new Promise((resolve, reject) => {
            if (!this.isConnected(recipientAddress)) {
                this.metrics.inc('send:failed:not-connected')
                this.debug('cannot send to %s because not connected', recipientAddress)
                reject(new Error(`cannot send to ${recipientAddress} because not connected`))
            } else {
                const ws = this.connections.get(recipientAddress)
                try {
                    if (ws.readyState === ws.OPEN) {
                        this.metrics.speed('_outSpeed')(message.length)
                        this.metrics.speed('_msgSpeed')(1)
                        this.metrics.speed('_msgOutSpeed')(1)

                        ws.send(message, (err) => {
                            if (err) {
                                reject(err)
                            } else {
                                this.metrics.inc('send:success')
                                this.debug('sent to %s message "%s"', recipientAddress, message)
                                resolve()
                            }
                        })
                    } else {
                        this.metrics.inc(`send:failed:readyState=${ws.readyState}`)
                        this.debug('sent failed because readyState of socket is %d', ws.readyState)
                        reject(new ReadyStateError(ws.readyState))
                    }
                } catch (e) {
                    this.metrics.inc('send:failed')
                    console.error('sending to %s failed because of %s, readyState is', recipientAddress, e, ws.readyState)
                    if (ws.readyState === 2 || ws.readyState === 3) {
                        ws.terminate()
                    }
                    reject(e)
                }
            }
        })
    }

    onReceive(peerInfo, address, message) {
        this.metrics.inc('onReceive')
        this.debug('received from %s [%s] message "%s"', peerInfo, address, message)
        this.emit(events.MESSAGE_RECEIVED, peerInfo, message)
    }

    close(recipientId, reason = '') {
        const recipientAddress = this.resolveAddress(recipientId)
        this.metrics.inc('close')
        if (!this.isConnected(recipientAddress)) {
            this.metrics.inc('close:error:not-connected')
            this.debug('cannot close connection to %s because not connected', recipientAddress)
        } else {
            const ws = this.connections.get(recipientAddress)
            try {
                this.debug('closing connection to %s, reason %s', recipientAddress, reason)
                ws.close(1000, reason)
            } catch (e) {
                this.metrics.inc('close:error:failed')
                console.error('closing connection to %s failed because of %s', recipientAddress, e)
            }
        }
    }

    connect(peerAddress) {
        this.metrics.inc('connect')

        if (this.isConnected(peerAddress)) {
            this.metrics.inc('connect:already-connected')
            this.debug('already connected to %s', peerAddress)
            return Promise.resolve(this.peerBook.getPeerId(peerAddress))
        }
        if (peerAddress === this.getAddress()) {
            this.metrics.inc('connect:own-address')
            this.debug('not allowed to connect to own address %s', peerAddress)
            return Promise.reject(new Error('trying to connect to own address'))
        }
        if (this.pendingConnections.has(peerAddress)) {
            this.metrics.inc('connect:pending-connection')
            this.debug('pending connection to %s', peerAddress)
            return this.pendingConnections.get(peerAddress)
        }

        const p = new Promise((resolve, reject) => {
            try {
                let serverPeerInfo
                const ws = new WebSocket(`${peerAddress}/?address=${this.getAddress()}`, toHeaders(this.peerInfo))

                ws.on('upgrade', (peerId, peerType) => {
                    serverPeerInfo = new PeerInfo(peerId, peerType)
                })

                ws.once('open', () => {
                    if (!serverPeerInfo) {
                        ws.terminate()
                        this.metrics.inc('connect:dropping-upgrade-never-received')
                        reject(new Error('dropping outgoing connection because upgrade event never received'))
                    } else {
                        const result = this._onNewConnection(ws, peerAddress, serverPeerInfo)
                        if (result) {
                            resolve(this.peerBook.getPeerId(peerAddress))
                        } else {
                            reject(new Error('duplicate connection is dropped'))
                        }
                    }
                })

                ws.on('error', (err) => {
                    this.metrics.inc('connect:failed-to-connect')
                    this.debug('failed to connect to %s, error: %o', peerAddress, err)
                    ws.terminate()
                    reject(err)
                })
            } catch (err) {
                this.metrics.inc('connect:failed-to-connect')
                this.debug('failed to connect to %s, error: %o', peerAddress, err)
                reject(err)
            }
        }).finally(() => {
            this.pendingConnections.delete(peerAddress)
        })

        this.pendingConnections.set(peerAddress, p)
        return p
    }

    stop() {
        clearInterval(this.checkConnectionsInterval)
        this.connections.forEach((connection) => {
            connection.close(disconnectionCodes.GRACEFUL_SHUTDOWN, disconnectionReasons.GRACEFUL_SHUTDOWN)
        })

        return new Promise((resolve, reject) => {
            // uws has setTimeout(cb, 20000); in close event
            this.wss.close()
            resolve()
        })
    }

    isConnected(address) {
        return this.connections.has(address)
    }

    getAddress() {
        if (this.advertisedWsUrl) {
            return this.advertisedWsUrl
        }
        // eslint-disable-next-line no-underscore-dangle
        const socketAddress = this.wss.httpServer._connectionKey.split(':')
        return `ws://${socketAddress[1]}:${socketAddress[2]}`
    }

    getPeers() {
        return this.connections
    }

    resolveAddress(peerId) {
        return this.peerBook.getAddress(peerId)
    }

    _onIncomingConnection(ws, req) {
        const parameters = url.parse(req.url, true)
        const { address } = parameters.query

        try {
            if (!address) {
                throw new Error('address not given')
            }
            const clientPeerInfo = fromHeaders(req.headers)

            this.debug('%s connected to me', address)
            this._onNewConnection(ws, address, clientPeerInfo)
        } catch (e) {
            this.debug('dropped incoming connection from %s because of %s', req.connection.remoteAddress, e)
            this.metrics.inc('_onIncomingConnection:closed:missing-required-parameter')
            ws.close(disconnectionCodes.MISSING_REQUIRED_PARAMETER, `${e}`)
        }
    }

    _onNewConnection(ws, address, peerInfo) {
        // Handle scenario where two peers have opened a socket to each other at the same time.
        // Second condition is a tiebreaker to avoid both peers of simultaneously disconnecting their socket,
        // thereby leaving no connection behind.
        if (this.isConnected(address) && this.getAddress().localeCompare(address) === 1) {
            this.metrics.inc('_onNewConnection:closed:dublicate')
            this.debug('dropped new connection with %s because an existing connection already exists', address)
            ws.close(disconnectionCodes.DUPLICATE_SOCKET, disconnectionReasons.DUPLICATE_SOCKET)
            return false
        }

        ws.on('message', (message) => {
            // TODO check message.type [utf8|binary]
            this.metrics.speed('_inSpeed')(message.length)
            this.metrics.speed('_msgSpeed')(1)
            this.metrics.speed('_msgInSpeed')(1)

            setImmediate(() => this.onReceive(peerInfo, address, message), 0)
        })

        ws.once('close', (code, reason) => {
            if (reason === disconnectionReasons.DUPLICATE_SOCKET) {
                this.metrics.inc('_onNewConnection:closed:dublicate')
                this.debug('socket %s dropped from other side because existing connection already exists')
                return
            }

            this.metrics.inc(`_onNewConnection:closed:code=${code}`)
            this.debug('socket to %s closed (code %d, reason %s)', address, code, reason)
            this.connections.delete(address)
            this.lastCheckedReadyState.delete(address)
            this.peerBook.getPeerId(address)
            this.debug('removed %s [%s] from connection list', peerInfo, address)
            this.emit(events.PEER_DISCONNECTED, peerInfo, reason)
        })

        this.peerBook.add(address, peerInfo)
        this.connections.set(address, ws)
        this.metrics.set('connections', this.connections.size)
        this.debug('added %s [%s] to connection list', peerInfo, address)
        this.emit(events.PEER_CONNECTED, peerInfo)

        return peerInfo
    }

    getMetrics() {
        const sockets = this.connections.values()
        const totalBufferSize = [...sockets].reduce((totalBufferSizeSum, ws) => totalBufferSizeSum + (ws.bufferedAmount || 0), 0)

        return {
            msgSpeed: this.metrics.speed('_msgSpeed')(),
            msgInSpeed: this.metrics.speed('_msgInSpeed')(),
            msgOutSpeed: this.metrics.speed('_msgOutSpeed')(),
            inSpeed: this.metrics.speed('_inSpeed')(),
            outSpeed: this.metrics.speed('_outSpeed')(),
            metrics: this.metrics.report(),
            totalBufferSize
        }
    }
}

async function startWebSocketServer(host, port) {
    return new Promise((resolve, reject) => {
        const conf = {
            port,
            clientTracking: true,
            perMessageDeflate: false
        }
        if (host) {
            conf.host = host
        }

        const wss = new WebSocket.Server(conf)

        wss.on('error', (err) => {
            reject(err)
        })

        wss.on('listening', () => {
            resolve(wss)
        })
    })
}

async function startEndpoint(host, port, peerInfo, advertisedWsUrl) {
    return startWebSocketServer(host, port).then((wss) => new WsEndpoint(wss, peerInfo, advertisedWsUrl))
}

module.exports = {
    WsEndpoint,
    events,
    startWebSocketServer,
    startEndpoint
}
