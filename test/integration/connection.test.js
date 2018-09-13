const assert = require('assert')
const { createConnection, events } = require('../../src/connection/Connection')
const { getTestConnections } = require('../util')

jest.setTimeout(60000)

describe('create two connections and init connection between them', () => {
    it('should be able to start and stop successfully', async (done) => {
        const MAX = 5

        // create MAX connections
        const connections = await getTestConnections(MAX, 30690)

        // check zero connections
        for (let i = 0; i < MAX; i++) {
            assert.equal(connections[i].getPeers().length, 0)
        }

        // connect current to the next, so all will have two connections
        let promises = []
        for (let i = 0; i < MAX; i++) {
            const nextConnection = i + 1 === MAX ? connections[0] : connections[i + 1]

            // eslint-disable-next-line no-await-in-loop
            promises.push(await connections[i].connect(nextConnection.node.peerInfo))
        }

        // then wait a little bit, so first will receive connection from the last
        await new Promise((resolve) => setTimeout(resolve, 1000)).then(() => {
            for (let i = 0; i < MAX; i++) {
                assert.equal(connections[i].getPeers().length, 2)
            }
        })

        promises = []
        console.log('shutdown')
        for (let i = 0; i < MAX; i++) {
            // eslint-disable-next-line no-await-in-loop
            promises.push(await connections[i].stop(console.log(`closing ${i} connection`)))
        }

        Promise.all(promises).then(() => done())
    })
})
