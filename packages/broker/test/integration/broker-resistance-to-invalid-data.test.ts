import http from 'http'
import { startTracker } from 'streamr-network'
import { Todo } from '../types'
import { startBroker, createClient } from '../utils'

const trackerPort = 12420
const networkPort = 12421
const httpPort = 12422

describe('broker resistance to invalid data', () => {
    let tracker: Todo
    let broker: Todo
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
            privateKey: '0xbc19ba842352248cb9132cc212f35d2f947dd66a0fda1e19021f9231e069c12d',
            networkPort,
            trackerPort,
            httpPort
        })

        // Create new stream
        const client = createClient(0)
        const freshStream = await client.createStream({
            name: 'broker-resistance-to-invalid-data.test.js-' + Date.now()
        })
        streamId = freshStream.id
        await client.ensureDisconnected()
        sessionToken = await client.session.getSessionToken()
    })

    afterEach(async () => {
        await broker.close()
        await tracker.stop()
    })

    test('pushing invalid data to HTTP plugin returns 400 error & does not crash broker', (done) => {
        const invalidData = '###!!THIS-DATA-IS-NOT-JSON!!###'

        const request = http.request({
            hostname: '127.0.0.1',
            port: httpPort,
            path: `/api/v1/streams/${streamId}/data`,
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
