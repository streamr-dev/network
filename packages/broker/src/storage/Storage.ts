import { auth, Client, tracker } from 'cassandra-driver'
import { MetricsContext } from 'streamr-network'
import { BatchManager } from './BatchManager'
import { Readable, Transform } from 'stream'
import { EventEmitter } from 'events'
import pump from 'pump'
import { v1 as uuidv1 } from 'uuid'
import merge2 from 'merge2'
import { Protocol } from 'streamr-network'
import { BucketManager } from './BucketManager'
import { Logger } from 'streamr-network'
import { Todo } from '../types'
import { Bucket, BucketId } from './Bucket'
import { StorageConfig } from './StorageConfig'

const logger = new Logger(module)

const MAX_RESEND_LAST = 10000

export interface StartCassandraOptions {
    contactPoints: string[]
    localDataCenter: string
    keyspace: string
    username: string
    password: string
    opts: Todo
    storageConfig: StorageConfig
}

export type MessageFilter = (streamMessage: Protocol.StreamMessage) => boolean

const bucketsToIds = (buckets: Bucket[]) => buckets.map((bucket: Bucket) => bucket.getId())

export class Storage extends EventEmitter {

    opts: Todo
    cassandraClient: Client
    bucketManager: BucketManager
    batchManager: BatchManager
    pendingStores: Map<string,NodeJS.Timeout>
    messageFilter: MessageFilter

    constructor(cassandraClient: Client, opts: Todo, messageFilter: MessageFilter) {
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
        this.messageFilter = messageFilter
    }

    async store(streamMessage: Protocol.StreamMessage): Promise<boolean> {
        logger.debug('Store message')
        if (this.messageFilter(streamMessage) === false) {
            return false
        }

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

        const resultStream = this._createResultStream()

        const makeLastQuery = (bucketIds: BucketId[]) => {
            const params = [streamId, partition, bucketIds, limit]

            this.cassandraClient.execute(GET_LAST_N_MESSAGES, params, {
                prepare: true,
                fetchSize: 0 // disable paging
            }).then((resultSet: Todo) => {
                resultSet.rows.reverse().forEach((r: Todo) => {
                    resultStream.write(r)
                })
                resultStream.push(null)
            }).catch((e: Todo) => {
                logger.warn(e)
                resultStream.push(null)
            })
        }

        let bucketId: BucketId
        const bucketIds: BucketId[] = []
        /**
         * Process:
         * - get latest bucketId => count number of messages in this bucket
         * - if enough => get all messages and return
         * - if not => move to the next bucket and repeat cycle
         */
        this.cassandraClient.eachRow(GET_BUCKETS, [streamId, partition], options, (n: Todo, row: Todo) => {
            bucketId = row.id
            bucketIds.push(bucketId)
        }, (err: Todo, result: Todo) => {
            if (err) {
                logger.error(err)
                resultStream.push(null)
            } else {
                // no buckets found at all
                if (!bucketId) {
                    resultStream.push(null)
                    return
                }

                // get total stored message in bucket
                this.cassandraClient.execute(COUNT_MESSAGES, [streamId, partition, bucketId], {
                    prepare: true,
                    fetchSize: 0 // disable paging
                }).then((resultSet: Todo) => {
                    const row = resultSet.first()
                    total += row.total.low

                    // if not enough messages and we next page exists, repeat eachRow
                    if (result.nextPage && total < limit && total < MAX_RESEND_LAST) {
                        result.nextPage()
                    } else {
                        makeLastQuery(bucketIds)
                    }
                }).catch((e: Todo) => {
                    logger.warn(e)
                    resultStream.push(null)
                })
            }
        })

        // Temporary counter for debugging purposes
        let counter = 0
        resultStream
            .on('data', () => {
                counter += 1
            })
            .on('end', () => {
                logger.info('Storage finished resendLast for stream %s with a total of %d sent messages', streamId, counter)
            })

        return resultStream
    }

    requestFrom(streamId: string, partition: number, fromTimestamp: number, fromSequenceNo: number, publisherId: string|null, msgChainId: string|null): Readable {
        logger.trace('requestFrom %o', { streamId, partition, fromTimestamp, fromSequenceNo, publisherId, msgChainId })

        //TODO: msgChainId is always null, remove on NET-143
        if (publisherId != null && msgChainId != null) {
            return this._fetchFromMessageRefForPublisher(streamId, partition, fromTimestamp,
                fromSequenceNo, publisherId, msgChainId)
        }
        if (publisherId == null && msgChainId == null) { // TODO should add fromSequenceNo to this call (NET-268)
            return this._fetchFromTimestamp(streamId, partition, fromTimestamp)
        }

        throw new Error('Invalid combination of requestFrom arguments')
    }

    requestRange(streamId: string, partition: number, fromTimestamp: number, fromSequenceNo: number, toTimestamp: number, toSequenceNo: number, publisherId: string|null, msgChainId: string|null): Readable {
        logger.trace('requestRange %o', { streamId, partition, fromTimestamp, fromSequenceNo, toTimestamp, toSequenceNo, publisherId, msgChainId })

        if (publisherId != null && msgChainId != null) {
            return this._fetchBetweenMessageRefsForPublisher(streamId, partition, fromTimestamp,
                fromSequenceNo, toTimestamp, toSequenceNo, publisherId, msgChainId)
        }

        if (publisherId == null && msgChainId == null) {
            return this._fetchBetweenTimestamps(streamId, partition, fromTimestamp, toTimestamp) // TODO should add fromSequenceNo and toSequenceNo to this call (NET-268)
        }

        throw new Error('Invalid combination of requestFrom arguments')
    }

    enableMetrics(metricsContext: MetricsContext) {
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

    close() {
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

    _fetchFromTimestamp(streamId: string, partition: number, fromTimestamp: number) {
        const resultStream = this._createResultStream()

        const query = 'SELECT payload FROM stream_data WHERE '
            + 'stream_id = ? AND partition = ? AND bucket_id IN ? AND ts >= ?'

        this.bucketManager.getBucketsByTimestamp(streamId, partition, fromTimestamp).then((buckets: Bucket[]) => {
            if (buckets.length === 0) { // TODO not an error as there is no data: do not throw
                throw new Error(`_fetchFromTimestamp: Failed to find buckets: ${streamId} ${partition}`)
            }

            const bucketsForQuery = bucketsToIds(buckets)

            const queryParams = [streamId, partition, bucketsForQuery, fromTimestamp]
            const cassandraStream = this._queryWithStreamingResults(query, queryParams)

            return pump(
                // @ts-expect-error TODO is cassandraStream EventEmitter or ReadableStream?
                cassandraStream,
                resultStream,
                (err?: Error) => {
                    if (err) {
                        logger.error('pump finished with error', err)
                        resultStream.push(null)
                    }
                }
            )
        })
            .catch((e: Todo) => {
                logger.warn(e)
                resultStream.push(null)
            })

        return resultStream
    }

    _fetchFromMessageRefForPublisher(streamId: string, partition: number, fromTimestamp: number, fromSequenceNo: number|null, publisherId?: string|null, msgChainId?: string|null) {
        const resultStream = this._createResultStream()

        const query1 = 'SELECT payload FROM stream_data WHERE stream_id = ? AND partition = ? AND bucket_id IN ? AND ts = ? AND sequence_no >= ? AND publisher_id = ? '
            + 'AND msg_chain_id = ? ALLOW FILTERING'
        const query2 = 'SELECT payload FROM stream_data WHERE stream_id = ? AND partition = ? AND bucket_id IN ? AND ts > ? AND publisher_id = ? '
            + 'AND msg_chain_id = ? ALLOW FILTERING'

        this.bucketManager.getBucketsByTimestamp(streamId, partition, fromTimestamp).then((buckets: Bucket[]) => {
            if (buckets.length === 0) { // TODO not an error as there is no data: do not throw
                throw new Error(`_fetchFromMessageRefForPublisher: Failed to find buckets: ${streamId} ${partition}`)
            }

            const bucketsForQuery = bucketsToIds(buckets)

            const queryParams1 = [streamId, partition, bucketsForQuery, fromTimestamp, fromSequenceNo, publisherId, msgChainId]
            const queryParams2 = [streamId, partition, bucketsForQuery, fromTimestamp, publisherId, msgChainId]
            const stream1 = this._queryWithStreamingResults(query1, queryParams1)
            const stream2 = this._queryWithStreamingResults(query2, queryParams2)

            return pump(
                // @ts-expect-error TODO is cassandraStream EventEmitter or ReadableStream?
                merge2(stream1, stream2),
                resultStream,
                (err: Todo) => {
                    if (err) {
                        logger.error('pump finished with error', err)
                        resultStream.push(null)
                    }
                }
            )
        })
            .catch((e: Todo) => {
                logger.warn(e)
                resultStream.push(null)
            })

        return resultStream
    }

    _fetchBetweenTimestamps(streamId: string, partition: number, fromTimestamp: number, toTimestamp: number) {
        const resultStream = this._createResultStream()

        const query = 'SELECT payload FROM stream_data WHERE '
            + 'stream_id = ? AND partition = ? AND bucket_id IN ? AND ts >= ? AND ts <= ?'

        this.bucketManager.getBucketsByTimestamp(streamId, partition, fromTimestamp, toTimestamp).then((buckets: Bucket[]) => {
            if (buckets.length === 0) { // TODO not an error as there is no data: do not throw
                throw new Error(`_fetchBetweenTimestamps: Failed to find buckets: ${streamId} ${partition}`)
            }

            const bucketsForQuery = bucketsToIds(buckets)

            const queryParams = [streamId, partition, bucketsForQuery, fromTimestamp, toTimestamp]
            const cassandraStream = this._queryWithStreamingResults(query, queryParams)

            return pump(
                // @ts-expect-error TODO is cassandraStream EventEmitter or ReadableStream?
                cassandraStream,
                resultStream,
                (err: Todo) => {
                    if (err) {
                        logger.error('pump finished with error', err)
                        resultStream.push(null)
                    }
                }
            )
        })
            .catch((e: Todo) => {
                logger.warn(e)
                resultStream.push(null)
            })

        return resultStream
    }

    _fetchBetweenMessageRefsForPublisher(streamId: string, partition: number, fromTimestamp: number, fromSequenceNo: number|null|undefined, toTimestamp: number, toSequenceNo: number|null|undefined, publisherId?: string|null, msgChainId?: string|null) {
        const resultStream = this._createResultStream()

        const query1 = 'SELECT payload FROM stream_data WHERE stream_id = ? AND partition = ? AND bucket_id IN ? AND ts = ? AND sequence_no >= ? AND publisher_id = ? '
            + 'AND msg_chain_id = ? ALLOW FILTERING'
        const query2 = 'SELECT payload FROM stream_data WHERE stream_id = ? AND partition = ? AND bucket_id IN ? AND ts > ? AND ts < ? AND publisher_id = ? '
            + 'AND msg_chain_id = ? ALLOW FILTERING'
        const query3 = 'SELECT payload FROM stream_data WHERE stream_id = ? AND partition = ? AND bucket_id IN ? AND ts = ? AND sequence_no <= ? AND publisher_id = ? '
            + 'AND msg_chain_id = ? ALLOW FILTERING'

        this.bucketManager.getBucketsByTimestamp(streamId, partition, fromTimestamp, toTimestamp).then((buckets: Bucket[]) => {
            if (buckets.length === 0) { // TODO not an error as there is no data: do not throw
                throw new Error(`_fetchBetweenMessageRefsForPublisher: Failed to find buckets: ${streamId} ${partition}`)
            }

            const bucketsForQuery = bucketsToIds(buckets)

            const queryParams1 = [streamId, partition, bucketsForQuery, fromTimestamp, fromSequenceNo, publisherId, msgChainId]
            const queryParams2 = [streamId, partition, bucketsForQuery, fromTimestamp, toTimestamp, publisherId, msgChainId]
            const queryParams3 = [streamId, partition, bucketsForQuery, toTimestamp, toSequenceNo, publisherId, msgChainId]
            const stream1 = this._queryWithStreamingResults(query1, queryParams1)
            const stream2 = this._queryWithStreamingResults(query2, queryParams2)
            const stream3 = this._queryWithStreamingResults(query3, queryParams3)

            return pump(
                // @ts-expect-error TODO is cassandraStream EventEmitter or ReadableStream?
                merge2(stream1, stream2, stream3),
                resultStream,
                (err: Todo) => {
                    if (err) {
                        logger.error('pump finished with error', err)
                        resultStream.push(null)
                    }
                }
            )
        })
            .catch((e: Todo) => {
                logger.warn(e)
                resultStream.push(null)
            })

        return resultStream
    }

    _queryWithStreamingResults(query: string, queryParams: any[]) {
        const cassandraStream = this.cassandraClient.stream(query, queryParams, {
            prepare: true,
            autoPage: false
        })

        // To avoid blocking main thread for too long, on every 1000th message
        // pause & resume the cassandraStream to give other events in the event
        // queue a chance to be handled.
        let resultCount = 0
        cassandraStream.on('data', () => {
            resultCount += 1
            if (resultCount % 1000 === 0) {
                // @ts-expect-error TODO is cassandraStream EventEmitter or ReadableStream?
                cassandraStream.pause()
                // @ts-expect-error TODO is cassandraStream EventEmitter or ReadableStream?
                setImmediate(() => cassandraStream.resume())
            }
        }).on('error', (err: Todo) => {
            logger.error(err)
        })

        return cassandraStream
    }

    _parseRow(row: Todo) {
        const streamMessage = Protocol.StreamMessage.deserialize(row.payload.toString())
        this.emit('read', streamMessage)
        return streamMessage
    }

    _createResultStream() {
        return new Transform({
            objectMode: true,
            transform: (row: Todo, _: Todo, done: Todo) => {
                done(null, this._parseRow(row))
            }
        })
    }

    async getFirstMessageTimestampInStream(streamId: string, partition: number) {
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

        return ts
    }

    async getLastMessageTimestampInStream(streamId: string, partition: number) {
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

        return ts
    }

    async getNumberOfMessagesInStream(streamId: string, partition: number) {
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

    async getTotalBytesInStream(streamId: string, partition: number) {
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
        const { count } = res.rows[0]

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
    opts,
    storageConfig
}: StartCassandraOptions) => {
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
    const messageFilter = (storageConfig !== undefined) ? (message: Protocol.StreamMessage) => {
        const stream = {
            id: message.messageId.streamId,
            partition: message.messageId.streamPartition
        }
        return storageConfig.hasStream(stream)
    } : () => true
    while (retryCount > 0) {
        /* eslint-disable no-await-in-loop */
        try {
            await cassandraClient.connect().catch((err: Todo) => { throw err })
            return new Storage(cassandraClient, opts || {}, messageFilter)
        } catch (err) {
            console.log('Cassandra not responding yet...')
            retryCount -= 1
            await sleep(5000)
            lastError = err
        }
        /* eslint-enable no-await-in-loop */
    }
    throw new Error(`Failed to connect to Cassandra after ${nbTrials} trials: ${lastError.toString()}`)
}
