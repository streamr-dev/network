import http from 'http'
import https from 'https'
import fs from 'fs'
import WebSocket from 'ws'
import { once } from 'events'
import { Socket } from 'net'
import qs, { ParsedQs } from 'qs'
import { StreamrClient } from '@streamr/sdk'
import { Logger, randomString } from '@streamr/utils'
import { addPingSender, addPingListener, Connection } from './Connection'
import { ApiAuthentication, isValidAuthentication } from '../../apiAuthentication'
import { PublishConnection } from './PublishConnection'
import { SubscribeConnection } from './SubscribeConnection'
import { PayloadFormat } from '../../helpers/PayloadFormat'
import { WebsocketPluginConfig } from './WebsocketPlugin'

const logger = new Logger(module)

enum Action {
    PUBLISH = 'publish',
    SUBSCRIBE = 'subscribe'
}

const sendHttpError = (status: string, socket: Socket) => {
    socket.write(`HTTP/1.1 ${status}\r\n\r\n`)
    socket.destroy()
}

interface ConnectionUrl {
    streamId: string
    action: string
    queryParams: ParsedQs
}

export class WebsocketServer {
    private wss?: WebSocket.Server
    private httpServer?: http.Server | https.Server
    private streamrClient: StreamrClient
    private pingSendInterval: number
    private disconnectTimeout: number

    constructor(streamrClient: StreamrClient, pingSendInterval: number, disconnectTimeout: number) {
        this.streamrClient = streamrClient
        this.pingSendInterval = pingSendInterval
        this.disconnectTimeout = disconnectTimeout
    }

    async start(
        port: number,
        payloadFormat: PayloadFormat,
        apiAuthentication?: ApiAuthentication,
        sslCertificateConfig?: WebsocketPluginConfig['sslCertificate']
    ): Promise<void> {
        this.httpServer =
            sslCertificateConfig !== undefined
                ? https.createServer({
                      key: fs.readFileSync(sslCertificateConfig.privateKeyFileName),
                      cert: fs.readFileSync(sslCertificateConfig.certFileName)
                  })
                : http.createServer()
        this.wss = new WebSocket.Server({ noServer: true })

        this.httpServer.on('upgrade', (request: http.IncomingMessage, socket: Socket, head: Buffer) => {
            let connectionUrl: ConnectionUrl
            let connection: Connection
            try {
                connectionUrl = this.parseUrl(request.url!)
                connection = this.createConnection(connectionUrl)
            } catch (err) {
                logger.warn('Reject incoming connection', {
                    requestUrl: request.url,
                    reason: err?.message
                })
                sendHttpError('400 Bad Request', socket)
                return
            }
            const apiKey = connectionUrl.queryParams.apiKey as string | undefined
            if (!isValidAuthentication(apiKey, apiAuthentication)) {
                logger.warn('Reject incoming connection', {
                    requestUrl: request.url,
                    includesApiKey: apiKey !== undefined,
                    reason: 'Invalid authentication'
                })
                sendHttpError(apiKey === undefined ? '401 Unauthorized' : '403 Forbidden', socket)
                return
            }
            this.wss!.handleUpgrade(request, socket, head, (ws: WebSocket) => {
                this.wss!.emit('connection', ws, request, connection)
            })
        })

        this.wss.on('connection', async (ws: WebSocket, _request: http.IncomingMessage, connection: Connection) => {
            const socketId = randomString(5)
            logger.info('Accept connection', { socketId })
            try {
                await connection.init(ws, socketId, this.streamrClient, payloadFormat)
                addPingListener(ws)
                if (this.pingSendInterval !== 0) {
                    addPingSender(ws, socketId, this.pingSendInterval, this.disconnectTimeout)
                }
            } catch (err) {
                logger.warn('Close connection', { socketId, reason: err?.message })
                ws.close()
            }
        })

        this.httpServer.listen(port)
        await once(this.httpServer, 'listening')
        logger.info(`Started Websocket server on port ${port}`)
    }

    // eslint-disable-next-line class-methods-use-this
    private createConnection(connectionUrl: ConnectionUrl): Connection | never {
        switch (connectionUrl.action) {
            case Action.PUBLISH:
                return new PublishConnection(connectionUrl.streamId, connectionUrl.queryParams)
            case Action.SUBSCRIBE:
                return new SubscribeConnection(connectionUrl.streamId, connectionUrl.queryParams)
            default:
                throw new Error(`Assertion failed: unknown action "${connectionUrl.action}"`)
        }
    }

    // eslint-disable-next-line class-methods-use-this
    private parseUrl(url: string): ConnectionUrl {
        const PATH_PATTERN = new RegExp(`^.*/streams/(.*)/(${Action.PUBLISH}|${Action.SUBSCRIBE})(\\?.*)?$`)
        const groups = url.match(PATH_PATTERN)
        if (groups !== null) {
            return {
                streamId: decodeURIComponent(groups[1]),
                action: groups[2] as Action,
                queryParams: qs.parse(groups[3], { ignoreQueryPrefix: true })
            }
        } else {
            throw new Error('Malformed path')
        }
    }

    async stop(): Promise<void> {
        this.wss!.close()
        for (const ws of this.wss!.clients) {
            ws.terminate()
        }
        this.httpServer!.close()
        await once(this.httpServer!, 'close')
        logger.info('Stopped Websocket server')
    }
}
