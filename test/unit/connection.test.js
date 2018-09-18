const { getTestConnections, DEFAULT_TIMEOUT } = require('../util')

jest.setTimeout(DEFAULT_TIMEOUT)

describe('create connection', () => {
    it('should be able to start and stop successfully', async (done) => {
        const MAX = 5

        // create MAX connections
        const connections = await getTestConnections(MAX, 30590)

        // stop all nodes
        const promises = []
        for (let i = 0; i < MAX; i++) {
            // eslint-disable-next-line no-await-in-loop
            promises.push(await connections[i].stop(console.log(`closing ${i} connection`)))
        }

        Promise.all(promises).then(() => done())
    })
})
