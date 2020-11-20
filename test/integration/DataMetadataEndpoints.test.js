const http = require('http')

const { startTracker, startNetworkNode } = require('streamr-network')
const { wait } = require('streamr-test-utils')

const { startBroker, createClient } = require('../utils')

const httpPort1 = 12371
const wsPort1 = 12372
const networkPort1 = 12373
const networkPort2 = 12374
const trackerPort = 12375
const broker1Key = '0x504b3683018f7b01533fc26df830f791dd0947c7d7f9940cd5e3748950996d75'

const httpGet = (url) => {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            res.setEncoding('utf8')
            let body = ''
            res.on('data', (chunk) => {
                body += chunk
            })
            res.on('end', () => resolve(body))
        }).on('error', reject)
    })
}

const WAIT_TIME_TO_LAND_IN_STORAGE = 3000

describe('DataMetadataEndpoints', () => {
    let tracker
    let broker1
    let client1
    let publisherNode
    let freshStream
    let freshStreamId

    beforeAll(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: trackerPort,
            id: 'tracker'
        })
        publisherNode = await startNetworkNode({
            host: '127.0.0.1',
            port: networkPort1,
            id: 'publisherNode',
            trackers: [tracker.getAddress()]
        })
        publisherNode.start()
        broker1 = await startBroker({
            name: 'broker1',
            privateKey: broker1Key,
            networkPort: networkPort2,
            trackerPort,
            httpPort: httpPort1,
            wsPort: wsPort1,
            enableCassandra: true,
            trackers: [tracker.getAddress()]

        })

        client1 = createClient(wsPort1)
    }, 10 * 1000)

    beforeEach(async () => {
        freshStream = await client1.createStream({
            name: 'broker.test.js-' + Date.now()
        })
        freshStreamId = freshStream.id
    })

    afterAll(async () => {
        await tracker.stop()
        await client1.ensureDisconnected()
        await publisherNode.stop()
        await broker1.close()
    })

    it('should fetch empty metadata from Cassandra', async () => {
        const json = await httpGet(`http://localhost:${httpPort1}/api/v1/streams/0/metadata/partitions/0`)
        const res = JSON.parse(json)

        expect(res.totalBytes).toEqual(0)
        expect(res.totalMessages).toEqual(0)
        expect(res.firstMessage).toEqual(0)
        expect(res.lastMessage).toEqual(0)
    })

    it('Should publish a single message, store it in Cassandra and return according metadata', async () => {
        await client1.publish(freshStreamId, {
            key: 1
        })
        await wait(WAIT_TIME_TO_LAND_IN_STORAGE)

        const json = await httpGet(`http://localhost:${httpPort1}/api/v1/streams/${freshStreamId}/metadata/partitions/0`)

        const res = JSON.parse(json)

        expect(res.totalBytes).toEqual(184)
        expect(res.totalMessages).toEqual(1)
        expect(res.firstMessage).toEqual(res.lastMessage)
    })

    it('Should publish multiple messages, store them in Cassandra and return according metadata', async () => {
        await client1.publish(freshStreamId, {
            key: 1
        })
        await client1.publish(freshStreamId, {
            key: 2
        })
        await client1.publish(freshStreamId, {
            key: 3
        })
        await client1.publish(freshStreamId, {
            key: 4
        })

        await wait(WAIT_TIME_TO_LAND_IN_STORAGE)

        const json = await httpGet(`http://localhost:${httpPort1}/api/v1/streams/${freshStreamId}/metadata/partitions/0`)

        const res = JSON.parse(json)

        expect(res.totalBytes).toEqual(775)
        expect(res.totalMessages).toEqual(4)
        expect(
            new Date(res.firstMessage).getTime()
        ).toBeLessThan(
            new Date(res.lastMessage).getTime()
        )
    })
})
