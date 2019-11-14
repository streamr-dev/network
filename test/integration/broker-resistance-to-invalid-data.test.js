const http = require('http')

const { startTracker } = require('streamr-network')
const StreamrClient = require('streamr-client')

const createBroker = require('../../src/broker')

const trackerPort = 12420
const brokerPort = 12421
const httpPort = 12422

function createClient(wsPort, apiKey) {
    return new StreamrClient({
        url: `ws://localhost:${wsPort}/api/v1/ws`,
        restUrl: 'http://localhost:8081/streamr-core/api/v1',
        auth: {
            apiKey
        }
    })
}

describe('broker resistance to invalid data', () => {
    let tracker
    let broker
    let streamId

    beforeEach(async () => {
        tracker = await startTracker('127.0.0.1', trackerPort, 'tracker')
        broker = await createBroker({
            network: {
                id: 'broker',
                hostname: '127.0.0.1',
                port: brokerPort,
                advertisedWsUrl: null,
                tracker: `ws://127.0.0.1:${trackerPort}`,
                isStorageNode: false
            },
            cassandra: false,
            reporting: false,
            sentry: false,
            streamrUrl: 'http://localhost:8081/streamr-core',
            adapters: [
                {
                    name: 'http',
                    port: httpPort
                }
            ],
        })

        // Create new stream
        const client = createClient(0, 'tester1-api-key')
        const freshStream = await client.createStream({
            name: 'broker-resistance-to-invalid-data.test.js-' + Date.now()
        })
        streamId = freshStream.id
        await client.ensureDisconnected()
    })

    afterEach(async () => {
        await broker.close()
        await tracker.stop()
    })

    test('pushing invalid data to HTTP adapter returns 400 error & does not crash broker', (done) => {
        const invalidData = '###!!THIS-DATA-IS-NOT-JSON!!###'

        const request = http.request({
            hostname: '127.0.0.1',
            port: httpPort,
            path: `/api/v1/streams/${streamId}/data`,
            method: 'POST',
            headers: {
                Authorization: 'token tester1-api-key',
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
