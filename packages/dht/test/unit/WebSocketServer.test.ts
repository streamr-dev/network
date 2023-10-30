import { WebSocketServer } from '../../src/connection/WebSocket/WebSocketServer'

describe('WebSocketServer', () => {

    it('starts and stops', async () => {
        const server = new WebSocketServer({
            portRange: { min: 19792, max: 19792 }
        })
        const port = await server.start()
        expect(port).toEqual(19792)
        await server.stop()
    })

    it('throws if server is already in use', async () => {
        const server1 = new WebSocketServer({
            portRange: { min: 19792, max: 19792 }
        })
        const port = await server1.start()
        expect(port).toEqual(19792)

        const server2 = new WebSocketServer({
            portRange: { min: 19792, max: 19792 }
        })
        await expect(server2.start())
            .rejects
            .toThrow()

        await server1.stop()
        await server2.stop()
    })

    it('Starts server in next port if first one is already in use', async () => {
        const server1 = new WebSocketServer({
            portRange: { min: 19792, max: 19793 }
        })
        const port1 = await server1.start()
        expect(port1).toEqual(19792)

        const server2 = new WebSocketServer({
            portRange: { min: 19792, max: 19793 }
        })
        const port2 = await server2.start()
        expect(port2).toEqual(19793)

        await server1.stop()
        await server2.stop()
    })

    it('throws if too big a port number is given', async () => {
        const server = new WebSocketServer({
            portRange: { min: 197923233, max: 197923233 }
        })

        await expect(server.start())
            .rejects
            .toThrow()

        await server.stop()
    })
})
