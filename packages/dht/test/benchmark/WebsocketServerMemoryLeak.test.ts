/* eslint-disable no-console */

import { wait } from '@streamr/utils'
import { WebsocketServer } from '../../src/connection/websocket/WebsocketServer'
import { WebsocketClientConnection } from '../../src/connection/websocket/NodeWebsocketClientConnection'

// This 'test' is meant to be run manually using the following command:
// node --inspect ../../../../node_modules/.bin/jest WebsocketServerMemoryLeak.test.ts
// while wathing for memory leaks in Chrome DevTools

describe('WebsocketServermemoryLeak', () => {
    it('Accepts and detroys connections', async () => {
        const server = new WebsocketServer({
            portRange: { min: 19792, max: 19792 },
            enableTls: false
        })

        server.on('connected', (connection) => {
            console.log('ServerWebsocket connected')
            connection.destroy()
            console.log('ServerWebsocket destroyed')
        })

        const port = await server.start()
        expect(port).toEqual(19792)

        for (let i = 0; i < 10000; i++) {
            const clientWebsocket: WebsocketClientConnection = new WebsocketClientConnection()
            clientWebsocket.on('connected', () => {
                console.log('clientWebsocket connected ' + i)
            })

            clientWebsocket.connect(`ws://127.0.0.1:${port}`, false)
            i++
            await wait(3000)
        }

        await server.stop()
    }, 120000000)
})
