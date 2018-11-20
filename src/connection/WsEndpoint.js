const { EventEmitter } = require('events')

const url = require('url')
const debug = require('debug')('streamr:connection:ws-endpoint')
const WebSocket = require('ws')

const Endpoint = require('./Endpoint')

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

        this.wss.on('connection', (ws, req) => {
            const parameters = url.parse(req.url, true)
            const { address } = parameters.query
            const customHeadersOfClient = this.customHeaders.pluckCustomHeadersFromObject(req.headers)

            if (!address) {
                ws.terminate()
                debug('dropped connection to me because address parameter not given')
            } else {
                debug('%s connected to me', address)
                this._onConnected(ws, address, customHeadersOfClient)
            }
        })

        // Add identity to server response headers before they are sent to client
        this.wss.on('headers', (headers) => {
            headers.push(...this.customHeaders.asArray())
        })

        debug('node started')
        debug('listening on: %s', this.getAddress())
    }

    async send(recipientAddress, message) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected(recipientAddress)) {
                debug('cannot send to %s because not in peer book', recipientAddress)
                reject(new Error(`cannot send to ${recipientAddress} because not in peer book`))
            } else {
                try {
                    const ws = this.connections.get(recipientAddress)
                    ws.send(message, (err) => {
                        if (err) {
                            reject(err)
                        } else {
                            debug('sent to %s message "%s"', recipientAddress, message)
                            resolve()
                        }
                    })
                } catch (e) {
                    console.error('sending to %s failed because of %s', recipientAddress, e)
                    reject(e)
                }
            }
        })
    }

    isConnected(address) {
        return this.connections.has(address)
    }

    onReceive(sender, message) {
        this.emit(Endpoint.events.MESSAGE_RECEIVED, {
            sender,
            message
        })
    }

    connect(peerAddress) {
        return new Promise((resolve, reject) => {
            if (this.isConnected(peerAddress)) {
                debug('found %s already in peer book', peerAddress)
                resolve()
            } else {
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
                            reject(new Error('upgrade event never received?'))
                        } else {
                            this._onConnected(ws, peerAddress, customHeadersOfServer)
                            resolve()
                        }
                    })

                    ws.on('error', (err) => {
                        debug('failed to connect to %s, error: %o', peerAddress, err)
                        reject(err)
                    })
                } catch (err) {
                    debug('failed to connect to %s, error: %o', peerAddress, err)
                    reject(err)
                }
            }
        })
    }

    _onConnected(ws, address, customHeaders) {
        ws.on('message', (message) => {
            // TODO check message.type [utf8|binary]
            this.onReceive(address, message)
        })

        ws.on('close', (code, reason) => {
            debug('socket to %s closed (code %d, reason %s)', address, code, reason)
            this.connections.delete(address)
            debug('removed %s from peer book', address)
            this.emit(Endpoint.events.PEER_DISCONNECTED, address)
        })

        this.connections.set(address, ws)
        debug('added %s to peer book (headers %o)', address, customHeaders)

        this.emit(Endpoint.events.PEER_CONNECTED, address, customHeaders)
    }

    async stop(callback = () => {}) {
        // close all connections
        this.connections.forEach((connection) => {
            connection.terminate()
        })

        return this.wss.close(callback)
    }

    getAddress() {
        const socketAddress = this.wss.address()
        return `ws://${socketAddress.address}:${socketAddress.port}`
    }

    getPeers() {
        return this.connections
    }
}

async function startWebsocketServer(host, port) {
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
    return startWebsocketServer(host, port).then((n) => new WsEndpoint(n, customHeaders))
}

module.exports = {
    CustomHeaders,
    WsEndpoint,
    startEndpoint
}
