/* eslint-disable no-console */

import { WebSocketServer } from "../../src/connection/WebSocket/WebSocketServer"
import { IConnection } from "../../src/connection/IConnection"
import { ClientWebSocket } from "../../src/connection/WebSocket/ClientWebSocket"

describe('WebSocket', () => {

    const webSocketServer = new WebSocketServer()
    const clientWebSocket = new ClientWebSocket()

    beforeAll(async () => {
        await webSocketServer.start(9999)
    })

    it('Happy path', (done) => {
            
        webSocketServer.on('connected', (serverConnection: IConnection) => {
            const time = Date.now()
            console.log('server side sendind msg at ' + time)
            serverConnection.send(Uint8Array.from([1, 2, 3, 4]))
        
            const time2 = Date.now()
            console.log('server side setting listeners at ' + time2)
            
            serverConnection.on('data', (bytes: Uint8Array) => {
                const time = Date.now()
                console.log('server side receiving message at ' + time)

                console.log("server received:" + JSON.stringify(bytes))
               
                expect(bytes.toString()).toBe('1,2,3,4')
                console.log('calling done()')
                done()
            })
        })
        
        clientWebSocket.on('connected', () => {
            const time = Date.now()
            console.log('client side setting listeners at ' + time)
            
            clientWebSocket.on('data', (bytes: Uint8Array) => {
                const time = Date.now()
                console.log('client side receiving message at ' + time)

                console.log("client received: " + JSON.stringify(bytes))
                expect(bytes.toString()).toBe('1,2,3,4')
                
                const time2 = Date.now()
                console.log('client side sendind msg at ' + time2)
                clientWebSocket.send(Uint8Array.from([1, 2, 3, 4]))
            })
        })

        clientWebSocket.connect('ws://127.0.0.1:9999')
    })

    afterAll(async () => {
        await webSocketServer.stop()
    })
})
