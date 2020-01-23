const cassandra = require('cassandra-driver')
const uuid = require('uuid')
const { wait } = require('streamr-test-utils')

const { startBroker, createClient } = require('../utils')

const contactPoints = ['127.0.0.1']
const localDataCenter = 'datacenter1'
const keyspace = 'streamr_dev'

const getLastTimeStamp = async (cassandraClient, streamId) => {
    const result = await cassandraClient.execute('SELECT * FROM stream_last_msg WHERE id = ? LIMIT 1', [
        streamId
    ])
    return result && result.rowLength > 0 ? Date.parse(result.rows[0].time) : undefined
}

const getLastTimeStamps = async (cassandraClient, streamIds) => {
    const result = await cassandraClient.execute('SELECT * FROM stream_last_msg WHERE id IN ?', [
        streamIds
    ])
    return result && result.rowLength > 0 ? result.rows.map((r) => Date.parse(r.time)) : undefined
}

const awaitForResult = async (fn, conditionFn) => {
    let result
    let attemptNo = 0
    while (!conditionFn(result) && attemptNo < 20) {
        // eslint-disable-next-line no-await-in-loop
        await wait(200)
        attemptNo += 1
        // eslint-disable-next-line no-await-in-loop
        result = await fn()
    }
    return result
}

const httpPort = 12941
const wsPort = 12951
const networkPort = 12961

describe('store last timestamp for each stream with each batch', () => {
    let broker
    let cassandraClient
    let client

    let stream
    let streamId
    let streamName

    beforeAll(async () => {
        broker = await startBroker('broker', networkPort, 30300, httpPort, wsPort, null, true)

        cassandraClient = new cassandra.Client({
            contactPoints,
            localDataCenter,
            keyspace
        })

        streamName = `last-timestamp-in-cassandra.test.js-${uuid.v4()}`

        client = createClient(wsPort, 'tester1-api-key')

        stream = await client.createStream({
            name: streamName
        })
        streamId = stream.id
    })

    afterAll(async () => {
        await Promise.all([
            await broker.close(),
            await client.ensureDisconnected(),
            await cassandraClient.shutdown()
        ])
    })

    test('expect lastTimestamp to be empty for new stream', async () => {
        const result = await getLastTimeStamp(cassandraClient, streamId)
        expect(result).toBeUndefined()
    })

    test('expect lastTimestamp to be not undefined and greater than now', async () => {
        const now = Date.now()
        await client.publish(streamId, {
            key: 1
        })

        const result = await awaitForResult(() => getLastTimeStamp(cassandraClient, streamId), (ts) => ts)

        expect(result).not.toBeUndefined()
        expect(result).toBeGreaterThan(now)
    })

    test('expect lastTimestamp to update after each publish', async () => {
        const currentLastTimeStamp = await getLastTimeStamp(cassandraClient, streamId)
        await client.publish(streamId, {
            key: 1
        })

        const result = await awaitForResult(
            () => getLastTimeStamp(cassandraClient, streamId),
            (ts) => ts && ts !== currentLastTimeStamp
        )

        expect(result).toBeGreaterThan(currentLastTimeStamp)
    })

    test('test getting N timestamps', async () => {
        const streamName2 = `stream-last-timestamp-${uuid.v4()}`
        const stream2 = await client.createStream({
            name: streamName2
        })
        const streamId2 = stream2.id

        await client.publish(streamId2, {
            key: 1
        })

        const result = await awaitForResult(
            () => getLastTimeStamps(cassandraClient, [streamId, streamId2]),
            (results) => results && results.length >= 2
        )

        expect(result.length).toEqual(2)
    })
})

