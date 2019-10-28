const events = Object.freeze({
    PEER_CONNECTED: 'streamr:peer:connect',
    PEER_DISCONNECTED: 'streamr:peer:disconnect',
    MESSAGE_RECEIVED: 'streamr:message-received'
})

const { EventEmitter } = require('events')
const url = require('url')

const createDebug = require('debug')
const WebSocket = require('ws')

const { disconnectionReasons } = require('../messages/messageTypes')
const Metrics = require('../metrics')

function transformToObjectWithLowerCaseKeys(o) {
    const transformedO = {}
    Object.entries(o).forEach(([k, v]) => {
        transformedO[k.toLowerCase()] = v
    })
    return transformedO
}

class CustomHeaders {
    constructor(headers) {
        this.headers = transformToObjectWithLowerCaseKeys(headers)
    }

    pluckCustomHeadersFromObject(object) {
        const headerNames = Object.keys(this.headers)
        const objectWithLowerCaseKeys = transformToObjectWithLowerCaseKeys(object)
        return headerNames.reduce((acc, headerName) => {
            return {
                ...acc,
                [headerName]: objectWithLowerCaseKeys[headerName]
            }
        }, {})
    }

    asObject() {
        return this.headers
    }

    asArray() {
        return Object.entries(this.headers)
            .map(([name, value]) => `${name}: ${value}`)
    }
}

class WsEndpoint extends EventEmitter {
    constructor(wss, customHeaders, advertisedWsUrl) {
        super()

        if (!wss) {
            throw new Error('wss not given')
        }
        if (!customHeaders) {
            throw new Error('customHeaders not given')
        }
        if (advertisedWsUrl === undefined) {
            throw new Error('advertisedWsUrl not given')
        }

        const id = customHeaders['streamr-peer-id'] || 'id-not-set'

        this.debug = createDebug(`streamr:connection:ws-endpoint:${id}`)

        this.wss = wss
        this.customHeaders = new CustomHeaders(customHeaders)
        this.advertisedWsUrl = advertisedWsUrl

        this.metrics = new Metrics('WsEndpoint')

        this.metrics.createSpeedometer('_inSpeed')
        this.metrics.createSpeedometer('_outSpeed')
        this.metrics.createSpeedometer('_msgSpeed')
        this.metrics.createSpeedometer('_msgInSpeed')
        this.metrics.createSpeedometer('_msgOutSpeed')

        this.connections = new Map()
        this.pendingConnections = new Map()

        this.wss.on('connection', this._onIncomingConnection.bind(this))

        this.wss.options.verifyClient = (info) => {
            const parameters = url.parse(info.req.url, true)
            const { address } = parameters.query

            if (this.isConnected(address)) {
                this.debug('already connected to %s, readyState %d', address, this.connections.get(address).ws.readyState)
                this.debug('closing existing socket')
                this.connections.get(address).duplex.destroy()
            }

            return true
        }

        // Attach custom headers to headers before they are sent to client
        this.wss.on('headers', (headers) => {
            headers.push(...this.customHeaders.asArray())
        })

        this.debug('listening on: %s', this.getAddress())
        this.checkConnectionsInterval = setInterval(this._checkConnections.bind(this), 2000)
    }

    _checkConnections() {
        Object.keys(this.connections).forEach((address) => {
            const { ws, duplex } = this.connections.get(address)

            if (ws.readyState !== 1) {
                this.metrics.inc(`_checkConnections:readyState=${ws.readyState}`)
                console.error(address + '\t\t\t' + ws.readyState)

                if (ws.readyState === 3) {
                    try {
                        duplex.destroy()
                    } catch (e) {
                        console.error('failed to close closed socket because of %s', e)
                    }
                }
            }
        })
    }

    sendSync(recipientAddress, message) {
        if (!this.isConnected(recipientAddress)) {
            this.metrics.inc('send:failed:not-connected')
            this.debug('cannot send to %s because not connected', recipientAddress)
        } else {
            const { ws, duplex } = this.connections.get(recipientAddress)
            try {
                setImmediate(() => {
                    duplex.write(message)
                    this.metrics.speed('_outSpeed')(message.length)
                    this.metrics.speed('_msgSpeed')(1)
                    this.metrics.speed('_msgOutSpeed')(1)
                    this.metrics.inc('send:success')
                }, 0)
            } catch (e) {
                this.metrics.inc('send:failed')
                console.error('sending to %s failed because of %s, readyState is', recipientAddress, e, ws.readyState)
                if (ws.readyState === 2 || ws.readyState === 3) {
                    duplex.destroy()
                }
            }
        }
    }

    send(recipientAddress, message) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected(recipientAddress)) {
                this.metrics.inc('send:failed:not-connected')
                this.debug('cannot send to %s because not connected', recipientAddress)
                reject(new Error(`cannot send to ${recipientAddress} because not connected`))
            } else {
                const { ws, duplex } = this.connections.get(recipientAddress)
                try {
                    duplex.write(message)
                    this.metrics.speed('_outSpeed')(message.length)
                    this.metrics.speed('_msgSpeed')(1)
                    this.metrics.speed('_msgOutSpeed')(1)
                    this.metrics.inc('send:success')
                    resolve()
                } catch (e) {
                    this.metrics.inc('send:failed')
                    console.error('sending to %s failed because of %s, readyState is', recipientAddress, e, ws.readyState)
                    if (ws.readyState === 2 || ws.readyState === 3) {
                        duplex.destroy()
                    }
                    reject(e)
                }
            }
        })
    }

    onReceive(sender, message) {
        this.metrics.inc('onReceive')
        this.debug('received from %s message "%s"', sender, message)
        this.emit(events.MESSAGE_RECEIVED, {
            sender,
            message
        })
    }

    close(recipientAddress, reason = '') {
        this.metrics.inc('close')
        return new Promise((resolve, reject) => {
            if (!this.isConnected(recipientAddress)) {
                this.metrics.inc('close:error:not-connected')
                this.debug('cannot close connection to %s because not connected', recipientAddress)
                reject(new Error(`cannot close connection to ${recipientAddress} because not connected`))
            } else {
                try {
                    this.debug('closing connection to %s, reason %s', recipientAddress, reason)
                    const { duplex } = this.connections.get(recipientAddress)
                    duplex.destroy()
                    resolve()
                } catch (e) {
                    this.metrics.inc('close:error:failed')
                    console.error('closing connection to %s failed because of %s', recipientAddress, e)
                    reject(e)
                }
            }
        })
    }

    connect(peerAddress) {
        this.metrics.inc('connect')
        if (this.isConnected(peerAddress)) {
            this.metrics.inc('connect:already-connected')
            this.debug('already connected to %s', peerAddress)
            return Promise.resolve()
        }
        if (this.pendingConnections.has(peerAddress)) {
            this.metrics.inc('connect:pending-connection')
            this.debug('pending connection to %s', peerAddress)
            return this.pendingConnections.get(peerAddress)
        }

        const p = new Promise((resolve, reject) => {
            try {
                let customHeadersOfServer
                const ws = new WebSocket(`${peerAddress}?address=${this.getAddress()}`, {
                    perMessageDeflate: false,
                    headers: this.customHeaders.asObject()
                })

                ws.once('upgrade', (response) => {
                    customHeadersOfServer = this.customHeaders.pluckCustomHeadersFromObject(response.headers)
                })

                ws.once('open', () => {
                    if (!customHeadersOfServer) {
                        ws.terminate()
                        this.metrics.inc('connect:dropping-upgrade-never-received')
                        reject(new Error('dropping outgoing connection because upgrade event never received'))
                    } else {
                        this._onNewConnection(ws, peerAddress, customHeadersOfServer)
                        resolve()
                    }
                })

                ws.on('error', (err) => {
                    this.metrics.inc('connect:failed-to-connect')
                    this.debug('failed to connect to %s, error: %o', peerAddress, err)
                    reject(new Error(err))
                })
            } catch (err) {
                this.metrics.inc('connect:failed-to-connect')
                this.debug('failed to connect to %s, error: %o', peerAddress, err)
                reject(new Error(err))
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
            connection.duplex.destroy()
        })

        return new Promise((resolve, reject) => {
            this.wss.close((err) => {
                if (err) {
                    reject(err)
                } else {
                    resolve()
                }
            })
        })
    }

    isConnected(address) {
        return this.connections.has(address)
    }

    getAddress() {
        if (this.advertisedWsUrl) {
            return this.advertisedWsUrl
        }
        const socketAddress = this.wss.address()
        return `ws://${socketAddress.address}:${socketAddress.port}`
    }

    getPeers() {
        return this.connections
    }

    _onIncomingConnection(ws, req) {
        const parameters = url.parse(req.url, true)
        const { address } = parameters.query

        if (!address) {
            this.metrics.inc('_onIncomingConnection:closed:no-address')
            ws.terminate()
            this.debug('dropped incoming connection from %s because address parameter missing',
                req.connection.remoteAddress)
        } else {
            this.debug('%s connected to me', address)
            const customHeadersOfClient = this.customHeaders.pluckCustomHeadersFromObject(req.headers)
            this._onNewConnection(ws, address, customHeadersOfClient)
        }
    }

    _onNewConnection(ws, address, customHeaders) {
        // Handle scenario where two peers have opened a socket to each other at the same time.
        // Second condition is a tiebreaker to avoid both peers of simultaneously disconnecting their socket,
        // thereby leaving no connection behind.
        if (this.isConnected(address) && this.getAddress().localeCompare(address) === 1) {
            this.metrics.inc('_onNewConnection:closed:dublicate')
            this.debug('dropped new connection with %s because an existing connection already exists', address)
            ws.close(1000, disconnectionReasons.DUPLICATE_SOCKET)
            return
        }

        const duplex = WebSocket.createWebSocketStream(ws, {
            encoding: 'utf8'
        })

        duplex.on('data', (message) => {
            // TODO check message.type [utf8|binary]
            this.metrics.speed('_inSpeed')(message.length)
            this.metrics.speed('_msgSpeed')(1)
            this.metrics.speed('_msgInSpeed')(1)

            setImmediate(() => this.onReceive(address, message), 0)
        })

        duplex.on('error', (message) => {
            duplex.destroy()
        })

        // TODO possible solution remove reasons?
        // duplex.on('close', () => {
        //     this.connections.delete(address)
        //     this.emit(events.PEER_DISCONNECTED, {
        //         address
        //     })
        // })

        ws.once('close', (code, reason) => {
            if (reason === disconnectionReasons.DUPLICATE_SOCKET) {
                this.metrics.inc('_onNewConnection:closed:dublicate')
                this.debug('socket %s dropped from other side because existing connection already exists')
                return
            }

            this.metrics.inc(`_onNewConnection:closed:code=${code}`)
            this.debug('socket to %s closed (code %d, reason %s)', address, code, reason)
            this.connections.delete(address)
            this.debug('removed %s from connection list', address)
            this.emit(events.PEER_DISCONNECTED, {
                address, reason
            })
        })

        this.connections.set(address, {
            ws,
            duplex
        })
        this.metrics.set('connections', this.connections.size)
        this.debug('added %s to connection list (headers %o)', address, customHeaders)
        this.emit(events.PEER_CONNECTED, address, customHeaders)
    }

    getMetrics() {
        const totalBufferSize = Object.values(this.connections).reduce((totalBufferSizeSum, ws) => totalBufferSizeSum + ws.bufferedAmount, 0)

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

async function startEndpoint(host, port, customHeaders, advertisedWsUrl) {
    return startWebSocketServer(host, port).then((wss) => new WsEndpoint(wss, customHeaders, advertisedWsUrl))
}

module.exports = {
    CustomHeaders,
    WsEndpoint,
    events,
    startWebSocketServer,
    startEndpoint
}
