const { EventEmitter } = require('events')
const url = require('url')
const debug = require('debug')('streamr:connection:ws-endpoint')
const WebSocket = require('ws')
const { disconnectionReasons } = require('../messages/messageTypes')
const Endpoint = require('./Endpoint')

class ReadyStateError extends Error {
    constructor(readyState) {
        super(`cannot send because socket.readyState=${readyState}`)
    }
}

class CustomHeaders {
    constructor(headers) {
        this.headers = this._transformToObjectWithLowerCaseKeys(headers)
    }

    pluckCustomHeadersFromObject(object) {
        const headerNames = Object.keys(this.headers)
        const objectWithLowerCaseKeys = this._transformToObjectWithLowerCaseKeys(object)
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

    _transformToObjectWithLowerCaseKeys(o) {
        const transformedO = {}
        Object.entries(o).forEach(([k, v]) => {
            transformedO[k.toLowerCase()] = v
        })
        return transformedO
    }
}

class WsEndpoint extends EventEmitter {
    constructor(wss, customHeaders) {
        super()

        if (!wss) {
            throw new Error('wss not given')
        }
        if (!customHeaders) {
            throw new Error('customHeaders not given')
        }

        this.wss = wss
        this.customHeaders = new CustomHeaders(customHeaders)

        this.endpoint = new Endpoint()
        this.endpoint.implement(this)

        this.connections = new Map()
        this.pendingConnections = new Map()

        this.wss.on('connection', this._onIncomingConnection.bind(this))

        // Attach custom headers to headers before they are sent to client
        this.wss.on('headers', (headers) => {
            headers.push(...this.customHeaders.asArray())
        })

        debug('listening on: %s', this.getAddress())
    }

    send(recipientAddress, message) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected(recipientAddress)) {
                debug('cannot send to %s because not connected', recipientAddress)
                reject(new Error(`cannot send to ${recipientAddress} because not connected`))
            } else {
                try {
                    const ws = this.connections.get(recipientAddress)
                    if (ws.readyState === ws.OPEN) {
                        ws.send(message, (err) => {
                            if (err) {
                                reject(err)
                            } else {
                                debug('sent to %s message "%s"', recipientAddress, message)
                                resolve()
                            }
                        })
                    } else {
                        debug('sent failed because readyState of socket is %d', ws.readyState)
                        reject(new ReadyStateError(ws.readyState))
                    }
                } catch (e) {
                    console.error('sending to %s failed because of %s', recipientAddress, e)
                    reject(e)
                }
            }
        })
    }

    onReceive(sender, message) {
        debug('received from %s message "%s"', sender, message)
        this.emit(Endpoint.events.MESSAGE_RECEIVED, {
            sender,
            message
        })
    }

    close(recipientAddress, reason) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected(recipientAddress)) {
                debug('cannot close connection to %s because not connected', recipientAddress)
                reject(new Error(`cannot close connection to ${recipientAddress} because not connected`))
            } else {
                try {
                    debug('closing connection to %s, reason %s', recipientAddress, reason)
                    const ws = this.connections.get(recipientAddress)
                    ws.close(1000, reason)
                } catch (e) {
                    console.error('closing connection to %s failed because of %s', recipientAddress, e)
                    reject(e)
                }
            }
        })
    }

    connect(peerAddress) {
        return new Promise((resolve, reject) => {
            if (this.isConnected(peerAddress)) {
                debug('already connected to %s', peerAddress)
                resolve()
            } else if (this.pendingConnections.has(peerAddress)) {
                debug('pending connection to %s', peerAddress)
                this.pendingConnections.get(peerAddress).push({
                    resolve,
                    reject
                })
            } else {
                this.pendingConnections.set(peerAddress, [{
                    resolve,
                    reject
                }])
                try {
                    let customHeadersOfServer
                    const ws = new WebSocket(`${peerAddress}?address=${this.getAddress()}`, {
                        headers: this.customHeaders.asObject()
                    })

                    ws.on('upgrade', (response) => {
                        customHeadersOfServer = this.customHeaders.pluckCustomHeadersFromObject(response.headers)
                    })

                    ws.on('open', () => {
                        if (!customHeadersOfServer) {
                            const err = new Error('dropping outgoing connection because upgrade event never received')
                            ws.terminate()
                            this.pendingConnections.get(peerAddress).forEach(({ reject: r }) => r(err))
                        } else {
                            this._onNewConnection(ws, peerAddress, customHeadersOfServer)
                            this.pendingConnections.get(peerAddress).forEach(({ resolve: r }) => r())
                        }
                        this.pendingConnections.delete(peerAddress)
                    })

                    ws.on('error', (err) => {
                        debug('failed to connect to %s, error: %o', peerAddress, err)
                        this.pendingConnections.get(peerAddress).forEach(({ reject: r }) => r(new Error(err)))
                        this.pendingConnections.delete(peerAddress)
                    })
                } catch (err) {
                    debug('failed to connect to %s, error: %o', peerAddress, err)
                    this.pendingConnections.get(peerAddress).forEach(({ reject: r }) => r(new Error(err)))
                    this.pendingConnections.delete(peerAddress)
                }
            }
        })
    }

    stop(callback = () => {}) {
        this.connections.forEach((connection) => {
            connection.terminate()
        })

        return this.wss.close(callback)
    }

    isConnected(address) {
        return this.connections.has(address)
    }

    getAddress() {
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
            ws.terminate()
            debug('dropped incoming connection from %s because address parameter missing',
                req.connection.remoteAddress)
        } else {
            debug('%s connected to me', address)
            const customHeadersOfClient = this.customHeaders.pluckCustomHeadersFromObject(req.headers)
            this._onNewConnection(ws, address, customHeadersOfClient)
        }
    }

    _onNewConnection(ws, address, customHeaders) {
        // Handle scenario where two peers have opened a socket to each other at the same time.
        // Second condition is a tiebreaker to avoid both peers of simultaneously disconnecting their socket,
        // thereby leaving no connection behind.
        if (this.isConnected(address) && this.getAddress().localeCompare(address) === 1) {
            debug('dropped new connection with %s because an existing connection already exists', address)
            ws.close(1000, disconnectionReasons.DUPLICATE_SOCKET)
            return
        }

        ws.on('message', (message) => {
            // TODO check message.type [utf8|binary]
            this.onReceive(address, message)
        })

        ws.on('close', (code, reason) => {
            if (reason === disconnectionReasons.DUPLICATE_SOCKET) {
                debug('socket %s dropped from other side because existing connection already exists')
                return
            }
            debug('socket to %s closed (code %d, reason %s)', address, code, reason)
            this.connections.delete(address)
            debug('removed %s from connection list', address)
            this.emit(Endpoint.events.PEER_DISCONNECTED, {
                address, reason
            })
        })

        this.connections.set(address, ws)
        debug('added %s to connection list (headers %o)', address, customHeaders)
        this.emit(Endpoint.events.PEER_CONNECTED, address, customHeaders)
    }
}

async function startWebSocketServer(host, port) {
    return new Promise((resolve, reject) => {
        const wss = new WebSocket.Server(
            {
                host,
                port,
                clientTracking: true
            }
        )

        wss.on('error', (err) => {
            reject(err)
        })

        wss.on('listening', () => {
            resolve(wss)
        })
    })
}

async function startEndpoint(host, port, customHeaders) {
    return startWebSocketServer(host, port).then((wss) => new WsEndpoint(wss, customHeaders))
}

module.exports = {
    CustomHeaders,
    WsEndpoint,
    startWebSocketServer,
    startEndpoint
}
