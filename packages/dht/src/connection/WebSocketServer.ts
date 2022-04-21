import * as http from 'http'
import { EventEmitter } from 'events'
import { server as WsServer, connection as WsConnection } from 'websocket'
import { ServerWebSocket } from './ServerWebSocket'
import { ConnectionSource, Event as ConnectionSourceEvent } from './ConnectionSource'

export class WebSocketServer extends EventEmitter implements ConnectionSource {

    private httpServer: http.Server | null = null
    private wsServer: WsServer | null = null

    start(port: number): Promise<void> {
        return new Promise((resolve, reject) => {
            this.httpServer = http.createServer((request, response) => {
                console.log((new Date()) + ' Received request for ' + request.url)
                response.writeHead(404)
                response.end()
            })

            this.httpServer.listen(port, () => {
                console.log((new Date()) + ' Server is listening on port ' + port)
                resolve()
            })

            this.wsServer = new WsServer({
                httpServer: this.httpServer,
                // You should not use autoAcceptConnections for production
                // applications, as it defeats all standard cross-origin protection
                // facilities built into the protocol and the browser.  You should
                // *always* verify the connection's origin and decide whether or not
                // to accept it.
                autoAcceptConnections: false
            })

            function originIsAllowed(origin: string) {
                // put logic here to detect whether the specified origin is allowed.
                return true
            }

            this.wsServer.on('request', (request) => {
                if (!originIsAllowed(request.origin)) {
                    // Make sure we only accept requests from an allowed origin
                    request.reject();
                    console.log((new Date()) + ' Connection from origin ' + request.origin + ' rejected.');
                    return;
                }

                const connection = request.accept(null, request.origin)

                console.log((new Date()) + ' Connection accepted.')

                this.emit(ConnectionSourceEvent.NEW_CONNECTION, new ServerWebSocket(connection))
            })
        })
    }

    async stop(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.wsServer?.shutDown()
            this.httpServer?.close(() => {
                resolve()
            })
        })
    }
}