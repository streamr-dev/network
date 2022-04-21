import { WebSocketConnector } from "../../src/connection/WebSocketConnector"
import { WebSocketServer } from "../../src/connection/WebSocketServer"
import { Event as ConnectionSourceEvent } from '../../src/connection/ConnectionSource'
import { Connection, Event as ConnectionEvent } from "../../src/connection/Connection"

describe('WebSocket', () => {
    
    const webSocketServer = new WebSocketServer()
    const webSocketConnector = new WebSocketConnector()

    beforeAll(async () => {
        await webSocketServer.start(9999)
    })

    it('Happy path', (done) => {
            
        webSocketServer.on(ConnectionSourceEvent.NEW_CONNECTION, (serverConnection: Connection) => {
            const time = Date.now()
            console.log('server side sendind msg at ' + time)
            serverConnection.send(Uint8Array.from([1,2,3,4]))
        })
        
        webSocketConnector.on(ConnectionSourceEvent.NEW_CONNECTION, (clientConnection: Connection) => {
            const time = Date.now()
            console.log('client side setting listeners at ' + time)
            
            clientConnection.on(ConnectionEvent.DATA, (bytes: Uint8Array) => {
                const time = Date.now()
                console.log('client side receiving message at ' + time)
                
                console.log(JSON.stringify(bytes.at(0)))

                expect(bytes.at(0)).toBe(1)
                expect(bytes.at(1)).toBe(2)
                expect(bytes.at(2)).toBe(3)
                expect(bytes.at(3)).toBe(4)
                
                done()
            })
        })

        webSocketConnector.connect('ws://localhost:9999')    
    })

    afterAll(async () => {
        await webSocketServer.stop()
    })

})