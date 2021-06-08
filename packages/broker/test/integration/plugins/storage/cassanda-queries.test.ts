import { Client } from 'cassandra-driver'
import { Protocol } from 'streamr-network'
import { waitForCondition, waitForEvent, waitForStreamToEnd } from 'streamr-test-utils'
import { Readable, PassThrough } from 'stream'
import { Storage } from '../../../../src/plugins/storage/Storage'
import { startCassandraStorage } from '../../../../src/plugins/storage/Storage'
import { STREAMR_DOCKER_DEV_HOST } from '../../../utils'
const { StreamMessage, MessageID } = Protocol.MessageLayer

const contactPoints = [STREAMR_DOCKER_DEV_HOST]
const localDataCenter = 'datacenter1'
const keyspace = 'streamr_dev_v2'

const MOCK_STREAM_ID = 'mock-stream-id-' + Date.now()
const MOCK_PUBLISHER_ID = 'publisherId'
const MOCK_MSG_CHAIN_ID = 'msgChainId'
const createMockMessage = (i: number) => {
    return new StreamMessage({
        messageId: new MessageID(MOCK_STREAM_ID, 0, i, 0, MOCK_PUBLISHER_ID, MOCK_MSG_CHAIN_ID),
        content: {
            value: i
        }
    })
}
const MOCK_MESSAGES = [1, 2, 3].map((contentValue: number) => createMockMessage(contentValue))

const EMPTY_STREAM_ID = 'empty-stream-id' + Date.now()

const REQUEST_TYPE_FROM = 'requestFrom'
const REQUEST_TYPE_RANGE = 'requestRange'

const streamToContentValues = async (resultStream: Readable) => {
    const messages: Protocol.StreamMessage[] = (await waitForStreamToEnd(resultStream)) as Protocol.StreamMessage[]
    return messages.map((message) => message.getContent().value)
}

class ProxyClient {

    static ERROR = new Error('mock-error')

    private realClient: Client
    private errorQueryId: string|undefined

    constructor(realClient: Client) {
        this.realClient = realClient
    }

    eachRow(query: string, params: any, options: any, rowCallback: any, resultCallback?: (err: Error|undefined, result: any) => void) {
        if (this.hasError(query)) {
            resultCallback!(ProxyClient.ERROR, undefined)
        } else {
            return this.realClient.eachRow(query, params, options, rowCallback, resultCallback)
        }
    }

    execute(query: string, params: any, options: any) {
        if (this.hasError(query)) {
            return Promise.reject(ProxyClient.ERROR)
        } else {
            return this.realClient.execute(query, params, options)
        }
    }

    stream(query: string, params: any, options: any, callback: any) {
        if (this.hasError(query)) {
            const stream = new PassThrough({
                objectMode: true
            })
            stream.destroy(ProxyClient.ERROR)
            return stream
        } else {
            return this.realClient.stream(query, params, options, callback)
        }
    }

    shutdown(): Promise<void> {
        return this.realClient.shutdown()
    }

    setError(queryId: string) {
        this.errorQueryId = queryId
    }

    private hasError(query: string): boolean {
        return (this.errorQueryId !== undefined) && query.includes(this.errorQueryId)
    }
}

describe('cassanda-queries', () => {

    let storage: Storage
    let realClient: Client

    const waitForStoredMessageCount = async (expectedCount: number) => {
        return waitForCondition(async () => {
            const result = await realClient.execute('SELECT COUNT(*) AS total FROM stream_data WHERE stream_id = ? ALLOW FILTERING', [
                MOCK_STREAM_ID
            ])
            const actualCount = result.rows[0].total.low
            return (actualCount === expectedCount)
        })
    }

    beforeAll(async () => {
        storage = await startCassandraStorage({
            contactPoints,
            localDataCenter,
            keyspace,
            opts: {
                checkFullBucketsTimeout: 100,
                storeBucketsTimeout: 100,
                bucketKeepAliveSeconds: 1
            }
        })
        realClient = new Client({
            contactPoints,
            localDataCenter,
            keyspace
        })
        await Promise.all(MOCK_MESSAGES.map((msg) => storage.store(msg)))
        await waitForStoredMessageCount(MOCK_MESSAGES.length)
    })

    afterAll(async () => {
        await storage?.close()
    })

    beforeEach(() => {
        const proxyClient = new ProxyClient(realClient) as any
        storage.cassandraClient = proxyClient
        storage.bucketManager.cassandraClient = proxyClient
    })

    describe('requestLast', () => {

        it('happy path', async () => {
            const resultStream = storage.requestLast(MOCK_STREAM_ID, 0, 2)
            const contentValues = await streamToContentValues(resultStream)
            expect(contentValues).toEqual([2, 3])
        })

        it('no messages', async () => {
            const resultStream = storage.requestLast(EMPTY_STREAM_ID, 0, 1)
            const contentValues = await streamToContentValues(resultStream)
            expect(contentValues).toEqual([])
        })

        it('bucket query error', async () => {
            (storage.cassandraClient as any).setError('FROM bucket')
            const resultStream = storage.requestLast(MOCK_STREAM_ID, 0, 1)
            const [ actualError ] = await waitForEvent(resultStream, 'error')
            expect(actualError).toBe(ProxyClient.ERROR)
        })

        it('message count query error', async () => {
            (storage.cassandraClient as any).setError('total FROM stream_data')
            const resultStream = storage.requestLast(MOCK_STREAM_ID, 0, 1)
            const [ actualError ] = await waitForEvent(resultStream, 'error')
            expect(actualError).toBe(ProxyClient.ERROR)
        })

        it('message query error', async () => {
            (storage.cassandraClient as any).setError('payload FROM stream_data')
            const resultStream = storage.requestLast(MOCK_STREAM_ID, 0, 1)
            const [ actualError ] = await waitForEvent(resultStream, 'error')
            expect(actualError).toBe(ProxyClient.ERROR)
        })

    })

    describe.each([
        [REQUEST_TYPE_FROM, null, null],
        [REQUEST_TYPE_FROM, MOCK_PUBLISHER_ID, null],
        [REQUEST_TYPE_RANGE, null, null],
        [REQUEST_TYPE_RANGE, MOCK_PUBLISHER_ID, MOCK_MSG_CHAIN_ID],
    ])('%s, publisher: %p', (requestType: string, publisherId: string|null, msgChainId: string|null) => {

        const getResultStream = (streamId: string): Readable => {
            const minMockTimestamp = MOCK_MESSAGES[0].getTimestamp()
            const maxMockTimestamp = MOCK_MESSAGES[MOCK_MESSAGES.length - 1].getTimestamp()
            if (requestType === REQUEST_TYPE_FROM) {
                return storage.requestFrom(streamId, 0, minMockTimestamp, 0, publisherId)
            } else if (requestType === REQUEST_TYPE_RANGE) {
                return storage.requestRange(streamId, 0, minMockTimestamp, 0, maxMockTimestamp, 0, publisherId, msgChainId)
            } else {
                throw new Error('Assertion failed')
            }
        }

        it('happy path', async () => {
            const resultStream = getResultStream(MOCK_STREAM_ID)
            const contentValues = await streamToContentValues(resultStream)
            expect(contentValues).toEqual([1, 2, 3])
        })

        it('no messages', async () => {
            const resultStream = getResultStream(EMPTY_STREAM_ID)
            const contentValues = await streamToContentValues(resultStream)
            expect(contentValues).toEqual([])
        })

        it('bucket query error', async () => {
            (storage.cassandraClient as any).setError('FROM bucket')
            const resultStream = getResultStream(MOCK_STREAM_ID)
            const [ actualError ] = await waitForEvent(resultStream, 'error')
            expect(actualError).toBe(ProxyClient.ERROR)
        })

        it('message query error', async () => {
            (storage.cassandraClient as any).setError('payload FROM stream_data')
            const resultStream = getResultStream(MOCK_STREAM_ID)
            const [ actualError ] = await waitForEvent(resultStream, 'error')
            expect(actualError).toBe(ProxyClient.ERROR)
        })

    })

})
