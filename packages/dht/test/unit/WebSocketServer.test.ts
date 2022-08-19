/* eslint-disable promise/no-nesting */

import { WebSocketServer } from "../../src/connection/WebSocket/WebSocketServer"

describe('WebSocketServer', () => {

    it('starts and stops with host "localhost"', async () => {
        const server = new WebSocketServer()
        await server.start(19792, 'localhost')
        await server.stop()
    })

    it('starts and stops if no host given', async () => {
        const server = new WebSocketServer()
        await server.start(19792)
        await server.stop()
    })

    // The await expect(doSomething()).rejects.toThrow('someError') method does not work
    // in browsers, use the old non-async way

    it('throws if too big a port number is given', (done) => {
        const server1 = new WebSocketServer()
        const server2 = new WebSocketServer()

        server1.start(19792)
            .then(() => {
                server2.start(19792).then(async () => {
                    await server1.stop()
                    await server2.stop()
                    done.fail('Expected exception was not thrown')
                    return
                }).catch(async (_e) => {
                    await server1.stop()
                    await server2.stop()
                    done()
                    return
                })
                return
            })
            .catch((e1) => {
                done.fail(e1)
                return
            })
    })

    it('throws if port is already in use', (done) => {
        const server = new WebSocketServer()

        server.start(197923233).then(async () => {
            await server.stop()
            done.fail('Expected exception was not thrown')
            return
        }).catch(async (_e) => {
            await server.stop()
            done()
            return
        })
    })
})
