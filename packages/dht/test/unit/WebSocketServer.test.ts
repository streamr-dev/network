/* eslint-disable promise/no-nesting */

import { WebSocketServer } from '../../src/connection/WebSocket/WebSocketServer'

describe('WebSocketServer', () => {

    it('starts and stops with host "127.0.0.1"', async () => {
        const server = new WebSocketServer()
        await server.start({ min: 19792, max: 19792 }, '127.0.0.1')
        await server.stop()
    })

    it('starts and stops if no host given', async () => {
        const server = new WebSocketServer()
        await server.start({ min: 19792, max: 19792 })
        await server.stop()
    })

    it('throws if server is already in use', async () => {
        const server1 = new WebSocketServer()
        await server1.start({ min: 19792, max: 19792 })
        
        const server2 = new WebSocketServer()
        
        await expect(server2.start({ min: 19792, max: 19792 }))
            .rejects
            .toThrow()

        await server1.stop()
        await server2.stop()
    })

    it('Starts server in next port if first one is already in use', async () => {
        const server1 = new WebSocketServer()
        await server1.start({ min: 19792, max: 19793 })
        
        const server2 = new WebSocketServer()
        await server2.start({ min: 19792, max: 19793 })

        await server1.stop()
        await server2.stop()
    })

    it('throws if too big a port number is given', async () => {
        const server = new WebSocketServer()

        await expect(server.start({ min: 197923233, max: 197923233 }))
            .rejects
            .toThrow()

        await server.stop()
    })
})
