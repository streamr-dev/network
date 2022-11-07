/* eslint-disable promise/no-nesting */

import { WebSocketServer } from "../../src/connection/WebSocket/WebSocketServer"

describe('WebSocketServer', () => {

    it('starts and stops with host "127.0.0.1"', async () => {
        const server = new WebSocketServer()
        await server.start(19792, '127.0.0.1')
        await server.stop()
    })

    it('starts and stops if no host given', async () => {
        const server = new WebSocketServer()
        await server.start(19792)
        await server.stop()
    })

    it('throws if too big a port number is given', async () => {
        const server1 = new WebSocketServer()
        await server1.start(19792)
        
        const server2 = new WebSocketServer()
        
        await expect(server2.start(19792))
            .rejects
            .toThrow()

        await server1.stop()
        await server2.stop()
    })

    it('throws if port is already in use', async () => {
        const server = new WebSocketServer()

        await expect(server.start(197923233))
            .rejects
            .toThrow()

        await server.stop()
    })
})
