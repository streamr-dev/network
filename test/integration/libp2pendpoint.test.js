const assert = require('assert')
const { getTestEndpoints, DEFAULT_TIMEOUT } = require('../util')

jest.setTimeout(DEFAULT_TIMEOUT)

describe('create two endpoints and init connection between them', () => {
    it('should be able to start and stop successfully', async (done) => {
        const MAX = 5

        // create MAX endpoints
        const endpoints = await getTestEndpoints(MAX, 30690)

        // check zero endpoints
        for (let i = 0; i < MAX; i++) {
            assert.equal(endpoints[i].getPeers().length, 0)
        }

        // connect current to the next, so all will have two connections
        let promises = []
        for (let i = 0; i < MAX; i++) {
            const nextEndpoint = i + 1 === MAX ? endpoints[0] : endpoints[i + 1]

            // eslint-disable-next-line no-await-in-loop
            promises.push(await endpoints[i].connect(nextEndpoint.node.peerInfo))
        }

        // then wait a little bit, so first will receive connection from the last
        await new Promise((resolve) => setTimeout(resolve, 3000)).then(() => {
            for (let i = 0; i < MAX; i++) {
                assert.equal(endpoints[i].getPeers().length, 2)
            }
        })

        promises = []
        for (let i = 0; i < MAX; i++) {
            // eslint-disable-next-line no-await-in-loop
            promises.push(await endpoints[i].stop(console.log(`closing ${i} endpoint`)))
        }

        Promise.all(promises).then(() => done())
    })
})
