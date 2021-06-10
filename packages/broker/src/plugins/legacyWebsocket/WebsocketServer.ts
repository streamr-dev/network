import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import qs from 'qs'
import { MetricsContext, NetworkNode, Protocol } from 'streamr-network'
const { ControlLayer, MessageLayer, Errors } = Protocol
// @ts-expect-error no type definitions
import ab2str from 'arraybuffer-to-string'
import uWS, { TemplatedApp } from 'uWebSockets.js'
import { RequestHandler } from './RequestHandler'
import { Connection } from './Connection'
import { Metrics } from 'streamr-network/dist/helpers/MetricsContext'
import { Publisher } from '../../Publisher'
import { SubscriptionManager } from '../../SubscriptionManager'
import { Logger } from 'streamr-network'
import { StreamStateManager } from '../../StreamStateManager'
import { StorageNodeRegistry } from '../../StorageNodeRegistry'
import { Stream } from '../../Stream'
import { StreamFetcher } from '../../StreamFetcher'

const logger = new Logger(module)

export class WebsocketServer extends EventEmitter {

    wss: TemplatedApp
    _listenSocket: uWS.us_listen_socket|null
    requestHandler: RequestHandler
    connections: Map<string,Connection>
    pingInterval: number
    metrics: Metrics
    _pingInterval: NodeJS.Timeout

    constructor(
        wss: TemplatedApp,
        port: number,
        networkNode: NetworkNode,
        streamFetcher: StreamFetcher,
        publisher: Publisher,
        metricsContext: MetricsContext,
        subscriptionManager: SubscriptionManager,
        storageNodeRegistry: StorageNodeRegistry,
        streamrUrl: string,
        pingInterval = 60 * 1000,
    ) {
        super()
        this.wss = wss
        this._listenSocket = null
        this.connections = new Map()
        this.pingInterval = pingInterval
        this.metrics = metricsContext.create('broker/ws')
            .addRecordedMetric('outBytes')
            .addRecordedMetric('outMessages')
            .addQueriedMetric('connections', () => this.connections.size)
            .addQueriedMetric('totalWebSocketBuffer', () => {
                let totalBufferSize = 0
                this.connections.forEach((connection: Connection) => {
                    if (connection.socket) {
                        totalBufferSize += connection.socket.getBufferedAmount()
                    }
                })
                return totalBufferSize
            })
            .addQueriedMetric('clientVersions', () => {
                const control: Record<number,number> = {}
                const message: Record<number,number> = {}
                const pairs: Record<string,number> = {}
                this.connections.forEach((connection: Connection) => {
                    const { controlLayerVersion, messageLayerVersion } = connection
                    const pairKey = controlLayerVersion + '->' + messageLayerVersion
                    if (control[controlLayerVersion] == null) {
                        control[controlLayerVersion] = 0
                    }
                    if (message[messageLayerVersion] == null) {
                        message[messageLayerVersion] = 0
                    }
                    if (pairs[pairKey] == null) {
                        pairs[pairKey] = 0
                    }
                    control[controlLayerVersion] += 1
                    message[messageLayerVersion] += 1
                    pairs[pairKey] += 1
                })
                return {
                    control,
                    message,
                    pairs
                }
            })

        const streams = new StreamStateManager()
        this.requestHandler = new RequestHandler(streamFetcher, publisher, streams, subscriptionManager, this.metrics, storageNodeRegistry, streamrUrl)
        networkNode.addMessageListener((msg: Protocol.MessageLayer.StreamMessage) => this._broadcastMessage(msg, streams))

        this._pingInterval = setInterval(() => {
            this._pingConnections()
        }, this.pingInterval)

        this.wss.listen(port, (token: uWS.us_listen_socket) => {
            if (token) {
                this._listenSocket = token
                logger.info('Legacy websocket plugin listening on ' + port)
            } else {
                logger.info('Failed to listen to port ' + port)
                this.close()
            }
        })

        this.wss.ws('/api/v1/ws', {
            /* Options */
            compression: 0,
            maxPayloadLength: 1024 * 1024,
            maxBackpressure: Connection.HIGH_BACK_PRESSURE + (1024 * 1024), // add 1MB safety margin
            idleTimeout: 3600, // 1 hour
            upgrade: (res: uWS.HttpResponse, req: uWS.HttpRequest, context: uWS.us_socket_context_t) => {
                let controlLayerVersion
                let messageLayerVersion

                // parse protocol version instructions from query parameters
                if (req.getQuery()) {
                    const query = qs.parse(req.getQuery())
                    if (query.controlLayerVersion && query.messageLayerVersion) {
                        // @ts-expect-error
                        controlLayerVersion = parseInt(query.controlLayerVersion)
                        // @ts-expect-error
                        messageLayerVersion = parseInt(query.messageLayerVersion)
                    }
                }

                try {
                    WebsocketServer.validateProtocolVersions(controlLayerVersion, messageLayerVersion)
                } catch (err) {
                    logger.trace('Rejecting connection with status 400 due to: %s, query params: %s', err.message, req.getQuery())
                    logger.trace(err)
                    res.writeStatus('400')
                    res.write(err.message)
                    res.end()
                    return
                }

                /* This immediately calls open handler, you must not use res after this call */
                res.upgrade(
                    {
                        controlLayerVersion,
                        messageLayerVersion,
                    },
                    /* Spell these correctly */
                    req.getHeader('sec-websocket-key'),
                    req.getHeader('sec-websocket-protocol'),
                    req.getHeader('sec-websocket-extensions'),
                    context
                )
            },
            open: (ws: uWS.WebSocket) => {
                const connection = new Connection(ws, ws.controlLayerVersion, ws.messageLayerVersion)
                this.connections.set(connection.id, connection)
                logger.trace('onNewClientConnection: socket "%s" connected', connection.id)
                // eslint-disable-next-line no-param-reassign
                ws.connectionId = connection.id

                connection.on('forceClose', (err: any) => {
                    try {
                        connection.socket.close()
                    } catch (e) {
                        // no need to check this error
                    } finally {
                        logger.warn('forceClose connection with id %s, because of %s', connection.id, err)
                        this._removeConnection(connection)
                    }
                })
            },
            message: (ws: uWS.WebSocket, message: ArrayBuffer, _isBinary: boolean) => {
                const connection = this.connections.get(ws.connectionId)

                if (connection) {
                    const copy = (src: ArrayBuffer) => {
                        const dst = new ArrayBuffer(src.byteLength)
                        new Uint8Array(dst).set(new Uint8Array(src))
                        return dst
                    }

                    const msg = copy(message)

                    setImmediate(async () => {
                        if (connection.isDead()) {
                            return
                        }

                        let request
                        try {
                            request = ControlLayer.ControlMessage.deserialize(ab2str(msg), false)
                        } catch (err) {
                            connection.send(new ControlLayer.ErrorResponse({
                                requestId: '', // Can't echo the requestId of the request since parsing the request failed
                                errorMessage: err.message || err,
                                // @ts-expect-error
                                errorCode: 'INVALID_REQUEST',
                            }))
                            return
                        }

                        try {
                            logger.trace('socket "%s" sent request "%s" with contents "%o"', connection.id, request.type, request)
                            await this.requestHandler.handleRequest(connection, request)
                        } catch (err) {
                            if (connection.isDead()) {
                                return
                            }
                            connection.send(new ControlLayer.ErrorResponse({
                                version: request.version,
                                requestId: request.requestId,
                                errorMessage: err.message || err,
                                errorCode: err.errorCode || 'ERROR_WHILE_HANDLING_REQUEST',
                            }))
                        }
                    })
                }
            },
            drain: (ws: uWS.WebSocket) => {
                const connection = this.connections.get(ws.connectionId)
                if (connection) {
                    connection.evaluateBackPressure()
                }
            },
            close: (ws: uWS.WebSocket, _code: number, _message: ArrayBuffer) => {
                const connection = this.connections.get(ws.connectionId)
                if (connection) {
                    logger.trace('closing socket "%s" on streams "%o"', connection.id, connection.streamsAsString())
                    this._removeConnection(connection)
                }
            },
            pong: (ws: uWS.WebSocket) => {
                const connection = this.connections.get(ws.connectionId)

                if (connection) {
                    logger.trace(`received from ${connection.id} "pong" frame`)
                    // @ts-expect-error
                    connection.respondedPong = true
                }
            }
        })
    }

    static validateProtocolVersions(controlLayerVersion: number|undefined, messageLayerVersion: number|undefined) {
        if (controlLayerVersion === undefined || messageLayerVersion === undefined) {
            throw new Error('Missing version negotiation! Must give controlLayerVersion and messageLayerVersion as query parameters!')
        }

        // Validate that the requested versions are supported
        if (ControlLayer.ControlMessage.getSupportedVersions().indexOf(controlLayerVersion) < 0) {
            throw new Errors.UnsupportedVersionError(controlLayerVersion, `Supported ControlLayer versions: ${
                JSON.stringify(ControlLayer.ControlMessage.getSupportedVersions())
            }. Are you using an outdated library?`)
        }

        if (MessageLayer.StreamMessage.getSupportedVersions().indexOf(messageLayerVersion) < 0) {
            throw new Errors.UnsupportedVersionError(messageLayerVersion, `Supported MessageLayer versions: ${
                JSON.stringify(MessageLayer.StreamMessage.getSupportedVersions())
            }. Are you using an outdated library?`)
        }
    }

    _removeConnection(connection: Connection) {
        this.connections.delete(connection.id)

        // Unsubscribe from all streams
        connection.forEachStream((stream: Stream) => {
            // for cleanup, spoof an UnsubscribeRequest to ourselves on the removed connection
            this.requestHandler.unsubscribe(
                connection,
                new ControlLayer.UnsubscribeRequest({
                    requestId: uuidv4(),
                    streamId: stream.id,
                    streamPartition: stream.partition,
                }),
                true,
            )
        })

        // Cancel all resends
        this.requestHandler.onConnectionClose(connection.id)

        connection.markAsDead()
    }

    close() {
        clearInterval(this._pingInterval)

        this.requestHandler.close()

        return new Promise((resolve) => {
            try {
                this.connections.forEach((connection: Connection) => connection.socket.close())
            } catch (e) {
                // ignoring any error
            }

            if (this._listenSocket) {
                uWS.us_listen_socket_close(this._listenSocket)
                this._listenSocket = null
            }

            // @ts-expect-error
            setTimeout(() => resolve(), 100)
        })
    }

    _pingConnections() {
        const connections = [...this.connections.values()]
        connections.forEach((connection) => {
            try {
                // @ts-expect-error
                // didn't get "pong" in pingInterval
                if (connection.respondedPong !== undefined && !connection.respondedPong) {
                    throw Error('Connection is not active')
                }

                // @ts-expect-error
                // eslint-disable-next-line no-param-reassign
                connection.respondedPong = false
                connection.ping()
                logger.trace(`pinging ${connection.id}`)
            } catch (e) {
                logger.error(`Failed to ping connection: ${connection.id}, error ${e}`)
                connection.emit('forceClose')
            }
        })
    }

    private _broadcastMessage(streamMessage: Protocol.StreamMessage, streams: StreamStateManager) {
        const streamId = streamMessage.getStreamId()
        const streamPartition = streamMessage.getStreamPartition()
        const stream = streams.get(streamId, streamPartition)

        if (stream) {
            stream.forEachConnection((connection: Connection) => {
                connection.send(new ControlLayer.BroadcastMessage({
                    requestId: '', // TODO: can we have here the requestId of the original SubscribeRequest?
                    streamMessage,
                }))
            })

            this.metrics.record('outBytes', streamMessage.getSerializedContent().length * stream.getConnections().length)
            this.metrics.record('outMessages', stream.getConnections().length)
        } else {
            logger.trace('broadcastMessage: stream "%s:%d" not found', streamId, streamPartition)
        }
    }
}
