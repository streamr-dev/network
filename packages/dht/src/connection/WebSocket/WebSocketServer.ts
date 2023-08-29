import * as http from 'http'
import EventEmitter from 'eventemitter3'
import { server as WsServer } from 'websocket'
import { ServerWebSocket } from './ServerWebSocket'
import {
    ConnectionSourceEvents
} from '../IConnectionSource'

import { Logger, asAbortable } from '@streamr/utils'
import { StartingWebSocketServerFailed } from '../../helpers/errors'
import { PortRange } from '../ConnectionManager'

const logger = new Logger(module)

// NodeJsWsServer is declared as a global in test-browser Electron tests
// in preload.js using "window.NodeJsWsServer = require('websocket').server".
// This is done in order to use the real nodejs websocket server in tests
// instead of a dummy polyfill.

declare class NodeJsWsServer extends WsServer { }

export class WebSocketServer extends EventEmitter<ConnectionSourceEvents> {

    private httpServer?: http.Server
    private wsServer?: WsServer
    private readonly abortController = new AbortController()
    
    public async start(portRange: PortRange, host?: string): Promise<number> {
        for (let port = portRange.min; port <= portRange.max; port++) {
            try {
                await asAbortable(this.startServer(port, host), this.abortController.signal)
                return port
            } catch (err) {
                logger.debug(`failed to start WebSocket server on port: ${port} reattempting on next port`)
            }
        }
        throw new StartingWebSocketServerFailed('Failed to start WebSocket server on any port in range')
    }

    private startServer(port: number, host?: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.httpServer = http.createServer((request, response) => {
                logger.trace('Received request for ' + request.url)
                response.writeHead(404)
                response.end()
            })

            function originIsAllowed(_uorigin: string) {
                return true
            }

            this.wsServer = this.createWsServer(this.httpServer)
            
            this.wsServer.on('request', (request) => {
                if (!originIsAllowed(request.origin)) {
                    // Make sure we only accept requests from an allowed origin
                    request.reject()
                    logger.trace('IConnection from origin ' + request.origin + ' rejected.')
                    return
                }
                
                const connection = request.accept(undefined, request.origin)
                
                logger.trace('IConnection accepted.')

                this.emit('connected', new ServerWebSocket(connection, request.resourceURL))
            })

            this.httpServer.once('error', (err: Error) => {
                reject(new StartingWebSocketServerFailed('Starting Websocket server failed', err))
            })

            this.httpServer.once('listening', () => {
                logger.debug('Websocket server is listening on port ' + port)
                resolve()
            })

            try {
                this.httpServer.listen(port, host)
            } catch (e) {
                reject(new StartingWebSocketServerFailed('Websocket server threw an exception', e))
            }
        })
    }

    public stop(): Promise<void> {
        this.abortController.abort()
        this.removeAllListeners()
        return new Promise((resolve, _reject) => {
            this.wsServer?.shutDown()
            this.httpServer?.close(() => {
                resolve()
            })
        })
    }

    private createWsServer(httpServer: http.Server): WsServer {
        // Use the real nodejs WebSocket server in Electron tests

        if (typeof NodeJsWsServer !== 'undefined') {
            return new NodeJsWsServer({
                httpServer,
                autoAcceptConnections: false
            })
        } else {
            return this.wsServer = new WsServer({
                httpServer,
                autoAcceptConnections: false
            })
        }
    }
}
