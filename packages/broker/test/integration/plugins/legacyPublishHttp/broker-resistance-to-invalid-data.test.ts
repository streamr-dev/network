import http from 'http'
import { startTracker, Tracker } from 'streamr-network'
import { Broker } from '../../../broker'
import { startBroker, createClient, createTestStream } from '../../../utils'

const trackerPort = 12420
const httpPort = 12422

describe.skip('broker resistance to invalid data', () => {
    let tracker: Tracker
    let broker: Broker
    let streamId: string
    let sessionToken: string

    beforeEach(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: trackerPort,
            id: 'tracker'
        })
        broker = await startBroker({
            name: 'broker',
            privateKey: '0x5e98cce00cff5dea6b454889f359a4ec06b9fa6b88e9d69b86de8e1c81887da0',
            trackerPort,
            httpPort
        })

        // Create new stream
        const client = createClient(tracker, '0x2cd9855d17e01ce041953829398af7e48b24ece04ff9d0e183414de54dc52285')
        const freshStream = await createTestStream(client, module)
        streamId = freshStream.id
        // sessionToken = await client.getSessionToken()
        await client.destroy()
    })

    afterEach(async () => {
        await broker.stop()
        await tracker.stop()
    })

    test('pushing invalid data to legacy HTTP plugin returns 400 error & does not crash broker', (done) => {
        const invalidData = '###!!THIS-DATA-IS-NOT-JSON!!###'

        const request = http.request({
            hostname: '127.0.0.1',
            port: httpPort,
            path: `/api/v1/streams/${encodeURIComponent(streamId)}/data`,
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + sessionToken,
                'Content-Type': 'application/json',
                'Content-Length': invalidData.length
            }
        }, (res) => {
            let data = ''

            res.on('data', (chunk) => {
                data += chunk
            })

            res.on('end', () => {
                expect(res.statusCode).toEqual(400)
                const asObject = JSON.parse(data)
                expect(Object.keys(asObject)).toEqual(['error'])
                done()
            })
        })

        request.on('error', (err) => {
            if (err) {
                done(err)
            } else {
                done(new Error('error cb'))
            }
        })

        request.write(invalidData)
        request.end()
    })
})
