import { auth, Client, tracker } from 'cassandra-driver'
import { MetricsContext } from 'streamr-network'
import { BatchManager } from './BatchManager'
import { Readable, Transform } from 'stream'
import { EventEmitter } from 'events'
import { pipeline } from 'stream'
import { v1 as uuidv1 } from 'uuid'
import merge2 from 'merge2'
import { Protocol } from 'streamr-network'
import { BucketManager } from './BucketManager'
import { Logger } from 'streamr-network'
import { Todo } from '../../types'
import { Bucket, BucketId } from './Bucket'

const logger = new Logger(module)

const MAX_RESEND_LAST = 10000

export interface StartCassandraOptions {
    contactPoints: string[]
    localDataCenter: string
    keyspace: string
    username?: string
    password?: string
    opts?: Todo
}

export type MessageFilter = (streamMessage: Protocol.StreamMessage) => boolean

const bucketsToIds = (buckets: Bucket[]) => buckets.map((bucket: Bucket) => bucket.getId())

interface NET329DebugInfo {
    streamId: string, 
    limit?: number,
    partition?: number,
    fromTimestamp?: number,
    fromSequenceNo?: number | null, 
    publisherId?: string | null,
}

export class Storage extends EventEmitter {

    opts: Todo
    cassandraClient: Client
    bucketManager: BucketManager
    batchManager: BatchManager
    pendingStores: Map<string,NodeJS.Timeout>

    constructor(cassandraClient: Client, opts: Todo) {
        super()

        const defaultOptions = {
            useTtl: false,
            retriesIntervalMilliseconds: 500
        }

        this.opts = {
            ...defaultOptions,
            ...opts
        }

        this.cassandraClient = cassandraClient
        this.bucketManager = new BucketManager(cassandraClient, opts)
        this.batchManager = new BatchManager(cassandraClient, {
            useTtl: this.opts.useTtl
        })
        this.pendingStores = new Map()
    }

    async store(streamMessage: Protocol.StreamMessage): Promise<boolean> {
        logger.debug('Store message')

        const bucketId = this.bucketManager.getBucketId(streamMessage.getStreamId(), streamMessage.getStreamPartition(), streamMessage.getTimestamp())

        return new Promise((resolve, reject) => {
            if (bucketId) {
                logger.trace(`found bucketId: ${bucketId}`)

                this.bucketManager.incrementBucket(bucketId, Buffer.byteLength(streamMessage.serialize()))
                setImmediate(() => this.batchManager.store(bucketId, streamMessage, (err?: Error) => {
                    if (err) {
                        reject(err)
                    } else {
                        this.emit('write', streamMessage)
                        resolve(true)
                    }
                }))
            } else {
                const messageId = streamMessage.messageId.serialize()
                logger.trace(`bucket not found, put ${messageId} to pendingMessages`)

                const uuid = uuidv1()
                const timeout = setTimeout(() => {
                    this.pendingStores.delete(uuid)
                    // eslint-disable-next-line promise/catch-or-return
                    this.store(streamMessage).then(resolve, reject)
                }, this.opts.retriesIntervalMilliseconds)
                this.pendingStores.set(uuid, timeout)
            }
        })
    }

    requestLast(streamId: string, partition: number, limit: number): Readable {
        if (limit > MAX_RESEND_LAST) {
            // eslint-disable-next-line no-param-reassign
            limit = MAX_RESEND_LAST
        }

        logger.trace('requestLast %o', { streamId, partition, limit })

        const GET_LAST_N_MESSAGES = 'SELECT payload FROM stream_data WHERE '
            + 'stream_id = ? AND partition = ? AND bucket_id IN ? '
            + 'ORDER BY ts DESC, sequence_no DESC '
            + 'LIMIT ?'
        const COUNT_MESSAGES = 'SELECT COUNT(*) AS total FROM stream_data WHERE stream_id = ? AND partition = ? AND bucket_id = ?'
        const GET_BUCKETS = 'SELECT id FROM bucket WHERE stream_id = ? AND partition = ?'

        let total = 0
        const options = {
            prepare: true, fetchSize: 1
        }

        const resultStream = this.createResultStream({streamId, partition, limit})

        const makeLastQuery = async (bucketIds: BucketId[]) => {
            try {
                const params = [streamId, partition, bucketIds, limit]
                const resultSet = await this.cassandraClient.execute(GET_LAST_N_MESSAGES, params, {
                    prepare: true,
                    fetchSize: 0 // disable paging
                })
                resultSet.rows.reverse().forEach((r: Todo) => {
                    resultStream.write(r)
                })
                resultStream.end()
            } catch (err) {
                resultStream.destroy(err)
            }
        }

        let bucketId: BucketId
        const bucketIds: BucketId[] = []
        /**
         * Process:
         * - get latest bucketId => count number of messages in this bucket
         * - if enough => get all messages and return
         * - if not => move to the next bucket and repeat cycle
         */
        this.cassandraClient.eachRow(GET_BUCKETS, [streamId, partition], options, (_n: Todo, row: Todo) => {
            bucketId = row.id
            bucketIds.push(bucketId)
        }, async (err: Todo, result: Todo) => {
            // do nothing if resultStream ended
            if (resultStream.writableEnded || resultStream.readableEnded) { return }
            if (err) {
                resultStream.destroy(err)
            } else {
                // no buckets found at all
                if (!bucketId) {
                    resultStream.end()
                    return
                }
                try {
                    // get total stored message in bucket
                    const resultSet = await this.cassandraClient.execute(COUNT_MESSAGES, [streamId, partition, bucketId], {
                        prepare: true,
                        fetchSize: 0 // disable paging
                    })
                    const row = resultSet.first()
                    total += row.total.low

                    // if not enough messages and we next page exists, repeat eachRow
                    if (result.nextPage && total < limit && total < MAX_RESEND_LAST) {
                        result.nextPage()
                    } else {
                        makeLastQuery(bucketIds)
                    }
                } catch (err) {
                    resultStream.destroy(err)
                }
            }
        })

        return resultStream
    }

    requestFrom(streamId: string, partition: number, fromTimestamp: number, fromSequenceNo: number, publisherId: string|null): Readable {
        logger.trace('requestFrom %o', { streamId, partition, fromTimestamp, fromSequenceNo, publisherId })

        if (publisherId != null) {
            return this.fetchFromMessageRefForPublisher(streamId, partition, fromTimestamp,
                fromSequenceNo, publisherId)
        }
        if (publisherId == null) { // TODO should add fromSequenceNo to this call (NET-268)
            return this.fetchFromTimestamp(streamId, partition, fromTimestamp)
        }

        throw new Error('Invalid combination of requestFrom arguments')
    }

    requestRange(
        streamId: string,
        partition: number,
        fromTimestamp: number,
        fromSequenceNo: number,
        toTimestamp: number,
        toSequenceNo: number,
        publisherId: string|null,
        msgChainId: string|null
    ): Readable {
        logger.trace('requestRange %o', { streamId, partition, fromTimestamp, fromSequenceNo, toTimestamp, toSequenceNo, publisherId, msgChainId })

        if (publisherId != null && msgChainId != null) {
            return this.fetchBetweenMessageRefsForPublisher(streamId, partition, fromTimestamp,
                fromSequenceNo, toTimestamp, toSequenceNo, publisherId, msgChainId)
        }

        if (publisherId == null && msgChainId == null) {
            // TODO should add fromSequenceNo and toSequenceNo to this call (NET-268)
            return this.fetchBetweenTimestamps(streamId, partition, fromTimestamp, toTimestamp)
        }

        throw new Error('Invalid combination of requestFrom arguments')
    }

    enableMetrics(metricsContext: MetricsContext): void {
        const cassandraMetrics = metricsContext.create('broker/cassandra')
            .addRecordedMetric('readCount')
            .addRecordedMetric('readBytes')
            .addRecordedMetric('writeCount')
            .addRecordedMetric('writeBytes')
            .addQueriedMetric('batchManager', () => this.batchManager.metrics())
        this.on('read', (streamMessage: Protocol.StreamMessage) => {
            cassandraMetrics.record('readCount', 1)
            cassandraMetrics.record('readBytes', streamMessage.getContent(false).length)
        })
        this.on('write', (streamMessage: Protocol.StreamMessage) => {
            cassandraMetrics.record('writeCount', 1)
            cassandraMetrics.record('writeBytes', streamMessage.getContent(false).length)
        })
    }

    close(): Promise<void> {
        const keys = [...this.pendingStores.keys()]
        keys.forEach((key) => {
            const timeout = this.pendingStores.get(key)
            clearTimeout(timeout!)
            this.pendingStores.delete(key)
        })

        this.bucketManager.stop()
        this.batchManager.stop()
        return this.cassandraClient.shutdown()
    }

    private fetchFromTimestamp(streamId: string, partition: number, fromTimestamp: number) {
        const resultStream = this.createResultStream({streamId, partition, fromTimestamp})

        const query = 'SELECT payload FROM stream_data WHERE '
            + 'stream_id = ? AND partition = ? AND bucket_id IN ? AND ts >= ?'

        this.bucketManager.getBucketsByTimestamp(streamId, partition, fromTimestamp).then((buckets: Bucket[]) => {
            if (buckets.length === 0) {
                resultStream.end()
                return
            }

            const bucketsForQuery = bucketsToIds(buckets)

            const queryParams = [streamId, partition, bucketsForQuery, fromTimestamp]
            const cassandraStream = this.queryWithStreamingResults(query, queryParams)

            return pipeline(
                cassandraStream,
                resultStream,
                (err?: Error | null) => {
                    if (err) {
                        resultStream.destroy(err)
                    }
                }
            )
        })
            .catch((e: Todo) => {
                resultStream.destroy(e)
            })

        return resultStream
    }

    private fetchFromMessageRefForPublisher(
        streamId: string,
        partition: number,
        fromTimestamp: number,
        fromSequenceNo: number | null,
        publisherId?: string | null
    ) {
        const resultStream = this.createResultStream({streamId, partition, fromTimestamp, fromSequenceNo, publisherId})

        const query1 = [
            'SELECT payload FROM stream_data',
            'WHERE stream_id = ? AND partition = ? AND bucket_id IN ?',
            'AND ts = ? AND sequence_no >= ? AND publisher_id = ?',
            'ALLOW FILTERING'
        ].join(' ')
        const query2 = [
            'SELECT payload FROM stream_data',
            'WHERE stream_id = ? AND partition = ? AND bucket_id IN ? AND ts > ? AND publisher_id = ?',
            'ALLOW FILTERING'
        ].join(' ')

        this.bucketManager.getBucketsByTimestamp(streamId, partition, fromTimestamp).then((buckets: Bucket[]) => {
            if (buckets.length === 0) {
                resultStream.end()
                return
            }

            const bucketsForQuery = bucketsToIds(buckets)

            const queryParams1 = [streamId, partition, bucketsForQuery, fromTimestamp, fromSequenceNo, publisherId]
            const queryParams2 = [streamId, partition, bucketsForQuery, fromTimestamp, publisherId]
            const stream1 = this.queryWithStreamingResults(query1, queryParams1)
            const stream2 = this.queryWithStreamingResults(query2, queryParams2)

            return pipeline(
                merge2(stream1, stream2, {
                    // @ts-expect-error options not in type
                    pipeError: true,
                }),
                resultStream,
                (err: Todo) => {
                    resultStream.destroy(err || undefined)
                    stream1.destroy(err || undefined)
                    stream2.destroy(err || undefined)
                }
            )
        })
            .catch((e: Todo) => {
                resultStream.destroy(e)
            })

        return resultStream
    }

    private fetchBetweenTimestamps(streamId: string, partition: number, fromTimestamp: number, toTimestamp: number) {
        const resultStream = this.createResultStream({streamId})

        const query = 'SELECT payload FROM stream_data WHERE '
            + 'stream_id = ? AND partition = ? AND bucket_id IN ? AND ts >= ? AND ts <= ?'

        this.bucketManager.getBucketsByTimestamp(streamId, partition, fromTimestamp, toTimestamp).then((buckets: Bucket[]) => {
            if (buckets.length === 0) {
                resultStream.end()
                return
            }

            const bucketsForQuery = bucketsToIds(buckets)

            const queryParams = [streamId, partition, bucketsForQuery, fromTimestamp, toTimestamp]
            const cassandraStream = this.queryWithStreamingResults(query, queryParams)

            return pipeline(
                cassandraStream,
                resultStream,
                (err: Error | null) => {
                    if (err) {
                        resultStream.destroy(err)
                    }
                }
            )
        })
            .catch((e: Todo) => {
                resultStream.destroy(e)
            })

        return resultStream
    }

    private fetchBetweenMessageRefsForPublisher(
        streamId: string,
        partition: number,
        fromTimestamp: number,
        fromSequenceNo: number|null|undefined,
        toTimestamp: number,
        toSequenceNo: number|null|undefined,
        publisherId?: string|null,
        msgChainId?: string|null
    ) {
        const resultStream = this.createResultStream({streamId})

        const query1 = [
            'SELECT payload FROM stream_data',
            'WHERE stream_id = ? AND partition = ? AND bucket_id IN ? AND ts = ?',
            'AND sequence_no >= ? AND publisher_id = ? AND msg_chain_id = ?',
            'ALLOW FILTERING'
        ].join(' ')
        const query2 = [
            'SELECT payload FROM stream_data',
            'WHERE stream_id = ? AND partition = ? AND bucket_id IN ?',
            'AND ts > ? AND ts < ? AND publisher_id = ? AND msg_chain_id = ?',
            'ALLOW FILTERING'
        ].join(' ')
        const query3 = [
            'SELECT payload FROM stream_data',
            'WHERE stream_id = ? AND partition = ? AND bucket_id IN ? AND ts = ?',
            'AND sequence_no <= ? AND publisher_id = ?  AND msg_chain_id = ?',
            'ALLOW FILTERING'
        ].join(' ')

        this.bucketManager.getBucketsByTimestamp(streamId, partition, fromTimestamp, toTimestamp).then((buckets: Bucket[]) => {
            if (buckets.length === 0) {
                resultStream.end()
                return
            }

            const bucketsForQuery = bucketsToIds(buckets)

            const queryParams1 = [streamId, partition, bucketsForQuery, fromTimestamp, fromSequenceNo, publisherId, msgChainId]
            const queryParams2 = [streamId, partition, bucketsForQuery, fromTimestamp, toTimestamp, publisherId, msgChainId]
            const queryParams3 = [streamId, partition, bucketsForQuery, toTimestamp, toSequenceNo, publisherId, msgChainId]
            const stream1 = this.queryWithStreamingResults(query1, queryParams1)
            const stream2 = this.queryWithStreamingResults(query2, queryParams2)
            const stream3 = this.queryWithStreamingResults(query3, queryParams3)

            return pipeline(
                merge2(stream1, stream2, stream3, {
                    // @ts-expect-error options not in type
                    pipeError: true,
                }),
                resultStream,
                (err: Error | null) => {
                    resultStream.destroy(err || undefined)
                    stream1.destroy(err || undefined)
                    stream2.destroy(err || undefined)
                    stream3.destroy(err || undefined)
                }
            )
        })
            .catch((e: Todo) => {
                resultStream.destroy(e)
            })

        return resultStream
    }

    private queryWithStreamingResults(query: string, queryParams: any[]) {
        return this.cassandraClient.stream(query, queryParams, {
            prepare: true,
            // force small page sizes, otherwise gives RangeError [ERR_OUT_OF_RANGE]: The value of "offset" is out of range.
            fetchSize: 128,
            readTimeout: 0,
        }) as Readable
    }

    private async parseRow(row: Todo, debugInfo: NET329DebugInfo) {
        if (row.payload === null){
            logger.error(`Found message with NULL payload on cassandra; debug info: ${JSON.stringify(debugInfo)}`)
            return null
        }

        const streamMessage = Protocol.StreamMessage.deserialize(row.payload.toString())
        this.emit('read', streamMessage)
        return streamMessage
    }

    private createResultStream(debugInfo: NET329DebugInfo) {
        const self = this // eslint-disable-line @typescript-eslint/no-this-alias
        let last = Date.now()
        return new Transform({
            highWaterMark: 1024, // buffer up to 1024 messages
            objectMode: true,
            transform(row: Todo, _: Todo, done: Todo){
                const now = Date.now()
                const message = self.parseRow(row, debugInfo)
                if (message){
                    this.push(message)
                }
                // To avoid blocking main thread for too long, after every 100ms
                // pause & resume the cassandraStream to give other events in the event
                // queue a chance to be handled.
                if ((now - last) > 100) {
                    setImmediate(() => {
                        last = Date.now()
                        done()
                    })
                } else {
                    done()
                }
            }
        })
    }

    async getFirstMessageTimestampInStream(streamId: string, partition: number): Promise<number> {
        const bucketQuery = 'SELECT id FROM bucket WHERE stream_id=? AND partition =? ORDER BY date_create ASC LIMIT 1'

        const queryParams = [streamId, partition]

        const buckets = await this.cassandraClient.execute(bucketQuery, queryParams, {
            prepare: true,
        })

        if (buckets.rows.length !== 1) {
            return 0
        }

        const bucketId = buckets.rows[0].id
        
        const query = 'SELECT ts FROM stream_data WHERE stream_id=? AND partition=? AND bucket_id=? ORDER BY ts ASC LIMIT 1'

        const streams = await this.cassandraClient.execute(query, [
            streamId,
            partition,
            bucketId
        ], {
            prepare: true
        })

        if (streams.rows.length !== 1) {
            return 0
        }

        const { ts } = streams.rows[0]

        return new Date(ts).getTime()
    }

    async getLastMessageTimestampInStream(streamId: string, partition: number): Promise<number> {
        const bucketQuery = 'SELECT id FROM bucket WHERE stream_id=? AND partition =? ORDER BY date_create DESC LIMIT 1'

        const queryParams = [streamId, partition]

        const buckets = await this.cassandraClient.execute(bucketQuery, queryParams, {
            prepare: true,
        })

        if (buckets.rows.length !== 1) {
            return 0
        }

        const bucketId = buckets.rows[0].id

        const query = 'SELECT ts FROM stream_data WHERE stream_id=? AND partition=? AND bucket_id=? ORDER BY ts DESC LIMIT 1'

        const streams = await this.cassandraClient.execute(query, [
            streamId,
            partition,
            bucketId
        ], {
            prepare: true
        })

        if (streams.rows.length !== 1) {
            return 0
        }

        const { ts } = streams.rows[0]

        return new Date(ts).getTime()
    }

    async getNumberOfMessagesInStream(streamId: string, partition: number): Promise<number> {
        const query = 'SELECT SUM(records) as count FROM bucket WHERE stream_id=? AND partition=?'
        const queryParams = [
            streamId,
            partition
        ]

        const res = await this.cassandraClient.execute(query, queryParams, {
            prepare: true
        })

        if (res.rows.length !== 1) {
            return 0
        }

        const { count } = res.rows[0]

        return count
    }

    async getTotalBytesInStream(streamId: string, partition: number): Promise<number> {
        const query = 'SELECT SUM(size) as count FROM bucket WHERE stream_id=? AND partition=?'
        const queryParams = [
            streamId,
            partition
        ]
        const res = await this.cassandraClient.execute(query, queryParams, {
            prepare: true
        })

        if (res.rows.length !== 1) {
            return 0
        }

        let { count } = res.rows[0]

        // Cassandra's integer has overflown, calculate fetching row by row
        if (count < 0){
            count = 0

            const query = 'SELECT size FROM bucket WHERE stream_id=? AND partition=?'
            const queryParams = [
                streamId,
                partition
            ]

            const res = await this.cassandraClient.execute(query, queryParams, {
                prepare: true
            })

            for (let i = 0; i < res.rows.length; i++){
                count += res.rows[i].size
            }
        }

        return count
    }

}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

export const startCassandraStorage = async ({
    contactPoints,
    localDataCenter,
    keyspace,
    username,
    password,
    opts
}: StartCassandraOptions): Promise<Storage> => {
    const authProvider = new auth.PlainTextAuthProvider(username || '', password || '')
    const requestLogger = new tracker.RequestLogger({
        slowThreshold: 10 * 1000, // 10 secs
    })
    // @ts-expect-error 'emitter' field is missing in type definition file
    requestLogger.emitter.on('slow', (message: Todo) => logger.warn(message))
    const cassandraClient = new Client({
        contactPoints,
        localDataCenter,
        keyspace,
        authProvider,
        requestTracker: requestLogger,
        pooling: {
            maxRequestsPerConnection: 32768
        }
    })
    const nbTrials = 20
    let retryCount = nbTrials
    let lastError = ''
    while (retryCount > 0) {
        /* eslint-disable no-await-in-loop */
        try {
            await cassandraClient.connect().catch((err: Todo) => { throw err })
            return new Storage(cassandraClient, opts || {})
        } catch (err) {
            // eslint-disable-next-line no-console
            console.log('Cassandra not responding yet...')
            retryCount -= 1
            await sleep(5000)
            lastError = err
        }
        /* eslint-enable no-await-in-loop */
    }
    throw new Error(`Failed to connect to Cassandra after ${nbTrials} trials: ${lastError.toString()}`)
}
