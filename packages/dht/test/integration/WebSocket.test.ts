/* eslint-disable no-console */

import { WebSocketServer } from "../../src/connection/WebSocket/WebSocketServer"
import { IConnection } from "../../src/connection/IConnection"
import { ClientWebSocket } from "../../src/connection/WebSocket/ClientWebSocket"
import { Logger } from "@streamr/utils"

const logger = new Logger(module)

describe('WebSocket', () => {

    const webSocketServer = new WebSocketServer()
    const clientWebSocket = new ClientWebSocket()

    beforeAll(async () => {
        await webSocketServer.start(9999)
    })

    it('Happy path', (done) => {
            
        webSocketServer.on('connected', (serverConnection: IConnection) => {
            const time = Date.now()
            logger.info('server side sendind msg at ' + time)
            serverConnection.send(Uint8Array.from([1, 2, 3, 4]))
        
            const time2 = Date.now()
            logger.info('server side setting listeners at ' + time2)
            
            serverConnection.on('data', (bytes: Uint8Array) => {
                const time = Date.now()
                logger.info('server side receiving message at ' + time)

                logger.info("server received:" + JSON.stringify(bytes))
               
                expect(bytes.toString()).toBe('1,2,3,4')
                logger.info('calling done()')
                done()
            })
        })
        
        clientWebSocket.on('connected', () => {
            const time = Date.now()
            logger.info('client side setting listeners at ' + time)
            
            clientWebSocket.on('data', (bytes: Uint8Array) => {
                const time = Date.now()
                logger.info('client side receiving message at ' + time)

                logger.info("client received: " + JSON.stringify(bytes))
                expect(bytes.toString()).toBe('1,2,3,4')
                
                const time2 = Date.now()
                logger.info('client side sendind msg at ' + time2)
                clientWebSocket.send(Uint8Array.from([1, 2, 3, 4]))
            })
        })

        clientWebSocket.connect('ws://127.0.0.1:9999')
    })

    afterAll(async () => {
        await webSocketServer.stop()
    })
})
