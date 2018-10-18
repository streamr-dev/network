const { DEFAULT_TIMEOUT, LOCALHOST, waitForEvent } = require('../util')
const endpointEvents = require('../../src/connection/Endpoint').events
const { startEndpoint } = require('../../src/connection/WsEndpoint')

jest.setTimeout(DEFAULT_TIMEOUT)

describe('create five endpoints and init connection between them', () => {
    const MAX = 5
    let promises = []
    const endpoints = []

    it('should be able to start and stop successfully', async () => {
        for (let i = 0; i < MAX; i++) {
            // eslint-disable-next-line no-await-in-loop
            const endpoint = await startEndpoint(LOCALHOST, 30690 + i, '', true).catch((err) => { throw err })
            endpoints.push(endpoint)
        }

        for (let i = 0; i < MAX; i++) {
            expect(endpoints[i].getPeers().size).toBe(0)
        }

        for (let i = 0; i < MAX; i++) {
            promises.push(waitForEvent(endpoints[i], endpointEvents.PEER_CONNECTED))

            const nextEndpoint = i + 1 === MAX ? endpoints[0] : endpoints[i + 1]

            // eslint-disable-next-line no-await-in-loop
            endpoints[i].connect(nextEndpoint.getAddress())
        }

        promises = []
        for (let i = 0; i < MAX; i++) {
            // eslint-disable-next-line no-await-in-loop
            promises.push(await waitForEvent(endpoints[i], endpointEvents.PEER_CONNECTED))
        }

        await Promise.all(promises)

        for (let i = 0; i < MAX; i++) {
            expect(endpoints[i].getPeers().size).toEqual(1)
        }

        for (let i = 0; i < MAX; i++) {
            // eslint-disable-next-line no-await-in-loop
            await endpoints[i].stop(console.log(`closing ${i} endpoint`))
        }
    })
})
