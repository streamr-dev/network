import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import { MetricsContext, NetworkNode, Protocol } from 'streamr-network'
const { ControlLayer, MessageLayer, Errors } = Protocol
import WebSocket from "ws"
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
import http from "http"
import https from "https"
import { parse as parseQuery } from 'querystring'
// @ts-expect-error no type definitions
import Cutter from 'utf8-binary-cutter'

const logger = new Logger(module)

const MAX_ERROR_MESSAGE_LENGTH = 123 // https://html.spec.whatwg.org/multipage/web-sockets.html

export class WebsocketServer extends EventEmitter {

    static validateProtocolVersions(controlLayerVersion: number|undefined, messageLayerVersion: number|undefined): void | never {
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

    private readonly httpServer: http.Server | https.Server
    private readonly wss: WebSocket.Server
    private readonly requestHandler: RequestHandler
    private readonly connections: Set<Connection>
    private readonly pingIntervalInMs: number
    private readonly metrics: Metrics
    private readonly pingInterval: NodeJS.Timeout

    constructor(
        httpServer: http.Server | https.Server,
        networkNode: NetworkNode,
        streamFetcher: StreamFetcher,
        publisher: Publisher,
        metricsContext: MetricsContext,
        subscriptionManager: SubscriptionManager,
        storageNodeRegistry: StorageNodeRegistry,
        streamrUrl: string,
        pingIntervalInMs = 60 * 1000,
    ) {
        super()
        this.httpServer = httpServer
        this.connections = new Set()
        this.pingIntervalInMs = pingIntervalInMs
        this.metrics = metricsContext.create('broker/ws')
            .addRecordedMetric('outBytes')
            .addRecordedMetric('outMessages')
            .addQueriedMetric('connections', () => this.connections.size)
            .addQueriedMetric('totalWebSocketBuffer', () => {
                let totalBufferSize = 0
                this.connections.forEach((connection: Connection) => {
                    totalBufferSize += connection.getBufferedAmount()
                })
                return totalBufferSize
            })
            .addQueriedMetric('clientVersions', () => {
                const control: Record<number, number> = {}
                const message: Record<number, number> = {}
                const pairs: Record<string, number> = {}
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
        this.requestHandler = new RequestHandler(
            streamFetcher,
            publisher,
            streams,
            subscriptionManager,
            this.metrics,
            storageNodeRegistry,
            streamrUrl
        )
        networkNode.addMessageListener((msg: Protocol.MessageLayer.StreamMessage) => this.broadcastMessage(msg, streams))

        this.wss = new WebSocket.Server({
            server: httpServer,
            maxPayload: 1024 * 1024
        })
        this.wss.on('connection', (ws: WebSocket, request: http.IncomingMessage) => {
            function closeWithError(internalMsg: string, clientMsg: string) {
                logger.trace(`rejected connection: ${internalMsg}`)
                ws.close(1000, Cutter.truncateToBinarySize(clientMsg, MAX_ERROR_MESSAGE_LENGTH))
            }

            if (request.url === undefined) {
                closeWithError(
                    'no request url available',
                    'no request url'
                )
                return
            }
            if (request.url.indexOf('?') < 0) {
                closeWithError(
                    'request url has no url parameters',
                    'url params missing'
                )
                return
            }

            const queryParams = parseQuery(request.url.replace(/^.*\?/, ''))
            if (!queryParams.controlLayerVersion) {
                closeWithError(
                    '"controlLayerVersion" url parameter missing',
                    'controlLayerVersion missing'
                )
                return
            }
            if (!queryParams.messageLayerVersion) {
                closeWithError(
                    '"messageLayerVersion" url parameter missing',
                    'messageLayerVersion missing'
                )
                return
            }
            if (Array.isArray(queryParams.controlLayerVersion)) {
                closeWithError(
                    '"controlLayerVersion" parameter set multiple times',
                    'multiple controlLayerVersion given'
                )
                return
            }
            if (Array.isArray(queryParams.messageLayerVersion)) {
                closeWithError(
                    '"messageLayerVersion" parameter set multiple times',
                    'multiple messageLayerVersion given'
                )
                return
            }
            const controlLayerVersion = parseInt(queryParams.controlLayerVersion)
            const messageLayerVersion = parseInt(queryParams.messageLayerVersion)

            try {
                WebsocketServer.validateProtocolVersions(controlLayerVersion, messageLayerVersion)
            } catch (err) {
                closeWithError(
                    `protocol version validation failed ${err}`,
                    'protocol version(s) not supported'
                )
                return
            }

            const duplexStream = WebSocket.createWebSocketStream(ws, {
                decodeStrings: false
            })
            const connection = new Connection(ws, duplexStream, controlLayerVersion, messageLayerVersion)
            connection.on('message', async (request) => {
                try {
                    logger.trace('socket "%s" sent request "%s" with contents "%o"',
                        connection.id,
                        request.type,
                        request
                    )
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
            connection.once('close', () => {
                this.removeConnection(connection)
            })
            this.connections.add(connection)
        })

        this.wss.on('error', (err) => {
            logger.error(`websocket server error: %s`, err)
        })

        this.pingInterval = setInterval(() => {
            this.pingConnections()
        }, this.pingIntervalInMs)
    }

    async close(): Promise<unknown> {
        clearInterval(this.pingInterval)
        this.requestHandler.close()
        this.connections.forEach((connection: Connection) => connection.close())
        return new Promise((resolve, reject) => {
            this.wss.close((err?) => {
                if (err) {
                    logger.error('error on closing websocket server: %s', err)
                }
                this.httpServer.close((err?) => {
                    if (err) {
                        logger.error('error closing http server: %s', err)
                        reject(err)
                    } else {
                        resolve(true)
                    }
                })
            })
        })
    }

    private removeConnection(connection: Connection): void {
        this.connections.delete(connection)

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
            ).catch((e) => {
                logger.error('removeConnection error %s', e)
            })
        })

        // Cancel all resends
        this.requestHandler.onConnectionClose(connection.id)
    }

    private pingConnections() {
        function logAndForceClose(connection: Connection, reason: string | Error): void {
            logger.error(`Failed to ping connection: ${connection.id}, reason ${reason}`)
            connection.forceClose(reason.toString())
        }

        const connections = [...this.connections.values()]
        connections.forEach((connection) => {
            if (!connection.hasRespondedToPong()) { // didn't get "pong" in pingInterval
                logAndForceClose(connection, 'no pong response')
                return
            }
            connection.setRespondedToPongAsFalse()
            try {
                connection.ping()
            } catch (e) {
                logger.error(`Failed to ping connection: ${connection.id}, error ${e}`)
                logAndForceClose(connection, 'failed to ping')
            }
        })
    }

    private broadcastMessage(streamMessage: Protocol.StreamMessage, streams: StreamStateManager) {
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
            logger.trace('broadcastMessage: stream "%s#%d" not found', streamId, streamPartition)
        }
    }
}
