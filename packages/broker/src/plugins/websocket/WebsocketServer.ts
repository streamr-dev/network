import http from 'http'
import https from 'https'
import fs from 'fs'
import WebSocket from 'ws'
import util from 'util'
import { once } from 'events'
import { Socket } from 'net'
import qs, { ParsedQs } from 'qs'
import StreamrClient from 'streamr-client'
import { Logger } from 'streamr-network'
import { Connection } from './Connection'
import { ApiAuthenticator } from '../../apiAuthenticator'
import { SslCertificateConfig } from '../../types'
import { PublishConnection } from './PublishConnection'
import { SubscribeConnection } from './SubscribeConnection'

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
    private httpServer?: http.Server|https.Server
    private streamrClient: StreamrClient

    constructor(streamrClient: StreamrClient) {
        this.streamrClient = streamrClient
    }

    async start(port: number, apiAuthenticator: ApiAuthenticator, sslCertificateConfig?: SslCertificateConfig): Promise<void> {
        this.httpServer = (sslCertificateConfig !== undefined) 
            ? https.createServer({
                key: fs.readFileSync(sslCertificateConfig.privateKeyFileName),
                cert: fs.readFileSync(sslCertificateConfig.certFileName)
            })
            : http.createServer()
        this.wss = new WebSocket.Server({ noServer: true })

        this.wss.on('connection', (ws: WebSocket, _request: http.IncomingMessage, connection: Connection) => {
            connection.init(ws, this.streamrClient)
        })

        this.httpServer.on('upgrade', (request: http.IncomingMessage, socket: Socket, head: Buffer) => {
            let connectionUrl: ConnectionUrl
            let connection: Connection
            try {
                connectionUrl = this.parseUrl(request.url!)
                connection = this.createConnection(connectionUrl)
            } catch (e) {
                logger.warn(`Unable to create connection: ${e.message} ${request.url}`)
                sendHttpError('400 Bad Request', socket)
                return
            }
            const apiKey = connectionUrl.queryParams.apiKey as string|undefined
            if (!apiAuthenticator.isValidAuthentication(apiKey)) {
                sendHttpError((apiKey === undefined) ? '401 Unauthorized' : '403 Forbidden', socket)
                return
            }
            this.wss!.handleUpgrade(request, socket, head, (ws: WebSocket) => {
                this.wss!.emit('connection', ws, request, connection)
            })
        })

        this.httpServer.listen(port)
        await once(this.httpServer, 'listening')
        logger.info('Websocket server listening on ' + port)
    }

    private createConnection(connectionUrl: ConnectionUrl): Connection|never {
        switch (connectionUrl.action) {
            case Action.PUBLISH:
                return new PublishConnection(connectionUrl.streamId, connectionUrl.queryParams)
            case Action.SUBSCRIBE:
                return new SubscribeConnection(connectionUrl.streamId, connectionUrl.queryParams)
            default:
                throw new Error(`Assertion failed: unknown action "${connectionUrl.action}"`)
        }
    }

    private parseUrl(url: string): ConnectionUrl {
        const PATH_PATTERN = new RegExp(`^.*/streams/(.*)/(${Action.PUBLISH}|${Action.SUBSCRIBE})(\\?.*)?$`)
        const groups = url.match(PATH_PATTERN)
        if (groups !== null) {
            return {
                streamId: decodeURIComponent(groups[1]),
                action: groups[2] as Action,
                queryParams: qs.parse(groups[3], { ignoreQueryPrefix: true})
            }
        } else {
            throw new Error('Malformed path')
        }
    }

    async stop(): Promise<void> {
        await util.promisify((cb: any) => this.wss!.close(cb))()
        this.httpServer!.close()
        await once(this.httpServer!, 'close')
        logger.info('WebSocket server stopped')
    }
}
