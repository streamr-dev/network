import {
    ContentType,
    EncryptionType,
    MessageID,
    SignatureType,
    StreamMessage,
    convertBytesToStreamMessage
} from '@streamr/sdk'
import { randomUserId, waitForStreamToEnd } from '@streamr/test-utils'
import { UserID, hexToBinary, toStreamID, utf8ToBinary, until, waitForEvent } from '@streamr/utils'
import { Client } from 'cassandra-driver'
import { PassThrough, Readable } from 'stream'
import { Storage, startCassandraStorage } from '../../../../src/plugins/storage/Storage'
import { STREAMR_DOCKER_DEV_HOST } from '../../../utils'

const contactPoints = [STREAMR_DOCKER_DEV_HOST]
const localDataCenter = 'datacenter1'
const keyspace = 'streamr_dev_v2'

const MOCK_STREAM_ID = `mock-stream-id-${Date.now()}`
const MOCK_PUBLISHER_ID = randomUserId()
const MOCK_MSG_CHAIN_ID = 'msgChainId'
const createMockMessage = (i: number) => {
    return new StreamMessage({
        messageId: new MessageID(toStreamID(MOCK_STREAM_ID), 0, i, 0, MOCK_PUBLISHER_ID, MOCK_MSG_CHAIN_ID),
        content: utf8ToBinary(
            JSON.stringify({
                value: i
            })
        ),
        signature: hexToBinary('0x1234'),
        contentType: ContentType.JSON,
        encryptionType: EncryptionType.NONE,
        signatureType: SignatureType.SECP256K1
    })
}
const MOCK_MESSAGES = [1, 2, 3].map((contentValue: number) => createMockMessage(contentValue))

const EMPTY_STREAM_ID = `empty-stream-id-${Date.now()}`

const REQUEST_TYPE_FROM = 'requestFrom'
const REQUEST_TYPE_RANGE = 'requestRange'

const streamToContentValues = async (resultStream: Readable) => {
    const messages: Uint8Array[] = (await waitForStreamToEnd(resultStream)) as Uint8Array[]
    return messages.map(convertBytesToStreamMessage).map((message) => (message.getParsedContent() as any).value)
}

class ProxyClient {
    static ERROR = new Error('mock-error')

    private realClient: Client
    private errorQueryId: string | undefined

    constructor(realClient: Client) {
        this.realClient = realClient
    }

    eachRow(
        query: string,
        params: any,
        options: any,
        rowCallback: any,
        resultCallback?: (err: Error | undefined, result: any) => void
    ) {
        if (this.hasError(query)) {
            resultCallback!(ProxyClient.ERROR, undefined)
        } else {
            this.realClient.eachRow(query, params, options, rowCallback, resultCallback)
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
        return this.errorQueryId !== undefined && query.includes(this.errorQueryId)
    }
}

describe('cassanda-queries', () => {
    let storage: Storage
    let realClient: Client

    const waitForStoredMessageCount = async (expectedCount: number) => {
        return until(async () => {
            const result = await realClient.execute(
                'SELECT COUNT(*) AS total FROM stream_data WHERE stream_id = ? ALLOW FILTERING',
                [MOCK_STREAM_ID]
            )
            const actualCount = result.rows[0].total.low
            return actualCount === expectedCount
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
        realClient = storage.cassandraClient
        await Promise.all(MOCK_MESSAGES.map((msg) => storage.store(msg)))
        await waitForStoredMessageCount(MOCK_MESSAGES.length)
    })

    afterAll(async () => {
        await storage.close() // also cleans up realClient
    })

    beforeEach(async () => {
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
            ;(storage.cassandraClient as any).setError('FROM bucket')
            const resultStream = storage.requestLast(MOCK_STREAM_ID, 0, 1)
            const [actualError] = await waitForEvent(resultStream, 'error')
            expect(actualError).toBe(ProxyClient.ERROR)
        })

        it('message count query error', async () => {
            ;(storage.cassandraClient as any).setError('total FROM stream_data')
            const resultStream = storage.requestLast(MOCK_STREAM_ID, 0, 1)
            const [actualError] = await waitForEvent(resultStream, 'error')
            expect(actualError).toBe(ProxyClient.ERROR)
        })

        it('message query error', async () => {
            ;(storage.cassandraClient as any).setError('payload FROM stream_data')
            const resultStream = storage.requestLast(MOCK_STREAM_ID, 0, 1)
            const [actualError] = await waitForEvent(resultStream, 'error')
            expect(actualError).toBe(ProxyClient.ERROR)
        })
    })

    describe.each([
        [REQUEST_TYPE_FROM, undefined, undefined],
        [REQUEST_TYPE_FROM, MOCK_PUBLISHER_ID, undefined],
        [REQUEST_TYPE_RANGE, undefined, undefined],
        [REQUEST_TYPE_RANGE, MOCK_PUBLISHER_ID, MOCK_MSG_CHAIN_ID]
    ])('%s, publisher: %p', (requestType: string, publisherId: UserID | undefined, msgChainId: string | undefined) => {
        const getResultStream = (streamId: string): Readable => {
            const minMockTimestamp = MOCK_MESSAGES[0].getTimestamp()
            const maxMockTimestamp = MOCK_MESSAGES[MOCK_MESSAGES.length - 1].getTimestamp()
            if (requestType === REQUEST_TYPE_FROM) {
                return storage.requestFrom(streamId, 0, minMockTimestamp, 0, publisherId)
            } else if (requestType === REQUEST_TYPE_RANGE) {
                return storage.requestRange(
                    streamId,
                    0,
                    minMockTimestamp,
                    0,
                    maxMockTimestamp,
                    0,
                    publisherId,
                    msgChainId
                )
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
            ;(storage.cassandraClient as any).setError('FROM bucket')
            const resultStream = getResultStream(MOCK_STREAM_ID)
            const [actualError] = await waitForEvent(resultStream, 'error')
            expect(actualError).toBe(ProxyClient.ERROR)
        })

        it('message query error', async () => {
            ;(storage.cassandraClient as any).setError('payload FROM stream_data')
            const resultStream = getResultStream(MOCK_STREAM_ID)
            const [actualError] = await waitForEvent(resultStream, 'error')
            expect(actualError).toBe(ProxyClient.ERROR)
        })
    })
})
