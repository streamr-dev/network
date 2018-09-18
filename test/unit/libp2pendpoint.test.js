const { getTestEndpoints } = require('../util')

jest.setTimeout(50000)

describe('create endpoint', () => {
    it('should be able to start and stop successfully', async (done) => {
        const MAX = 5

        // create MAX endpoints
        const endpoints = await getTestEndpoints(MAX, 30590)

        // stop all nodes
        const promises = []
        for (let i = 0; i < MAX; i++) {
            // eslint-disable-next-line no-await-in-loop
            promises.push(await endpoints[i].stop(console.log(`closing ${i} endpoint`)))
        }

        Promise.all(promises).then(() => done())
    })
})
