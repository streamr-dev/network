/* eslint-disable no-console */

import { WebsocketServer } from '../../src/connection/websocket/WebsocketServer'
import { IConnection } from '../../src/connection/IConnection'
import { ClientWebsocket } from '../../src/connection/websocket/ClientWebsocket'
import { Logger } from '@streamr/utils'

const logger = new Logger(module)

describe('WebSocket', () => {

    const websocketServer = new WebsocketServer({
        portRange: { min: 9999, max: 9999 }
    })
    const clientWebSocket = new ClientWebsocket()

    beforeAll(async () => {
        await websocketServer.start()
    })

    it('Happy path', (done) => {
            
        websocketServer.on('connected', (serverConnection: IConnection) => {
            const time = Date.now()
            logger.info('server side sendind msg at ' + time)
            serverConnection.send(Uint8Array.from([1, 2, 3, 4]))
        
            const time2 = Date.now()
            logger.info('server side setting listeners at ' + time2)
            
            serverConnection.on('data', (bytes: Uint8Array) => {
                const time = Date.now()
                logger.info('server side receiving message at ' + time)

                logger.info('server received:' + JSON.stringify(bytes))
               
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

                logger.info('client received: ' + JSON.stringify(bytes))
                expect(bytes.toString()).toBe('1,2,3,4')
                
                const time2 = Date.now()
                logger.info('client side sendind msg at ' + time2)
                clientWebSocket.send(Uint8Array.from([1, 2, 3, 4]))
            })
        })

        clientWebSocket.connect('ws://127.0.0.1:9999')
    })

    afterAll(async () => {
        await websocketServer.stop()
    })
})
