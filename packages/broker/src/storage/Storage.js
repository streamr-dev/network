const { Transform } = require('stream')
const EventEmitter = require('events')

const pump = require('pump')
const { v1: uuidv1 } = require('uuid')
const merge2 = require('merge2')
const cassandra = require('cassandra-driver')
const { StreamMessage } = require('streamr-network').Protocol.MessageLayer

const logger = require('../helpers/logger')('streamr:storage')

const BatchManager = require('./BatchManager')
const BucketManager = require('./BucketManager')

const MAX_RESEND_LAST = 10000

const bucketsToIds = (buckets) => buckets.map((bucket) => bucket.getId())

class Storage extends EventEmitter {
    constructor(cassandraClient, opts) {
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
        this.bucketManager = new BucketManager(cassandraClient)
        this.batchManager = new BatchManager(cassandraClient, {
            useTtl: this.opts.useTtl
        })
        this.pendingStores = new Map()
    }

    store(streamMessage) {
        const bucketId = this.bucketManager.getBucketId(streamMessage.getStreamId(), streamMessage.getStreamPartition(), streamMessage.getTimestamp())

        return new Promise((resolve, reject) => {
            if (bucketId) {
                logger.debug(`found bucketId: ${bucketId}`)

                this.bucketManager.incrementBucket(bucketId, Buffer.from(streamMessage.serialize()).length)
                setImmediate(() => this.batchManager.store(bucketId, streamMessage, (err) => {
                    if (err) {
                        reject(err)
                    } else {
                        this.emit('write', streamMessage)
                        resolve()
                    }
                }))
            } else {
                const messageId = streamMessage.messageId.serialize()
                logger.debug(`bucket not found, put ${messageId} to pendingMessages`)

                const uuid = uuidv1()
                const timeout = setTimeout(() => {
                    this.pendingStores.delete(uuid)
                    this.store(streamMessage)
                        .then(resolve)
                        .catch(reject)
                }, this.opts.retriesIntervalMilliseconds)
                this.pendingStores.set(uuid, timeout)
            }
        })
    }

    requestLast(streamId, partition, limit) {
        if (limit > MAX_RESEND_LAST) {
            // eslint-disable-next-line no-param-reassign
            limit = MAX_RESEND_LAST
        }

        logger.debug(`requestLast, streamId: "${streamId}", partition: "${partition}", limit: "${limit}"`)

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

        const makeLastQuery = (bucketIds) => {
            const params = [streamId, partition, bucketIds, limit]

            this.cassandraClient.execute(GET_LAST_N_MESSAGES, params, {
                prepare: true,
                fetchSize: 0 // disable paging
            }).then((resultSet) => {
                resultSet.rows.reverse().forEach((r) => {
                    resultStream.write(r)
                })
                resultStream.push(null)
            }).catch((e) => {
                logger.warn(e)
                resultStream.push(null)
            })
        }

        let bucketId
        const bucketIds = []
        /**
         * Process:
         * - get latest bucketId => count number of messages in this bucket
         * - if enough => get all messages and return
         * - if not => move to the next bucket and repeat cycle
         */
        this.cassandraClient.eachRow(GET_BUCKETS, [streamId, partition], options, (n, row) => {
            bucketId = row.id
            bucketIds.push(bucketId)
        }, (err, result) => {
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
                }).then((resultSet) => {
                    const row = resultSet.first()
                    total += row.total.low

                    // if not enough messages and we next page exists, repeat eachRow
                    if (result.nextPage && total < limit && total < MAX_RESEND_LAST) {
                        result.nextPage()
                    } else {
                        makeLastQuery(bucketIds)
                    }
                }).catch((e) => {
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

    requestFrom(streamId, partition, fromTimestamp, fromSequenceNo, publisherId, msgChainId) {
        logger.debug(`requestFrom, streamId: "${streamId}", partition: "${partition}", fromTimestamp: "${fromTimestamp}", fromSequenceNo: `
            + `"${fromSequenceNo}", publisherId: "${publisherId}", msgChainId: "${msgChainId}"`)

        if (fromSequenceNo != null && publisherId != null && msgChainId != null) {
            return this._fetchFromMessageRefForPublisher(streamId, partition, fromTimestamp,
                fromSequenceNo, publisherId, msgChainId)
        }
        if ((fromSequenceNo == null || fromSequenceNo === 0) && publisherId == null && msgChainId == null) {
            return this._fetchFromTimestamp(streamId, partition, fromTimestamp)
        }

        throw new Error('Invalid combination of requestFrom arguments')
    }

    requestRange(streamId, partition, fromTimestamp, fromSequenceNo, toTimestamp, toSequenceNo, publisherId, msgChainId) {
        logger.debug(`requestRange, streamId: "${streamId}", partition: "${partition}", fromTimestamp: "${fromTimestamp}", fromSequenceNo: "${fromSequenceNo}"`
            + `, toTimestamp: "${toTimestamp}", toSequenceNo: "${toSequenceNo}", publisherId: "${publisherId}", msgChainId: "${msgChainId}"`)

        if (fromSequenceNo != null && toSequenceNo != null && publisherId != null && msgChainId != null) {
            return this._fetchBetweenMessageRefsForPublisher(streamId, partition, fromTimestamp,
                fromSequenceNo, toTimestamp, toSequenceNo, publisherId, msgChainId)
        }
        if ((fromSequenceNo == null || fromSequenceNo === 0) && (toSequenceNo == null || toSequenceNo === 0)
            && publisherId == null && msgChainId == null) {
            return this._fetchBetweenTimestamps(streamId, partition, fromTimestamp, toTimestamp)
        }

        throw new Error('Invalid combination of requestFrom arguments')
    }

    enableMetrics(metricsContext) {
        const cassandraMetrics = metricsContext.create('broker/cassandra')
            .addRecordedMetric('readCount')
            .addRecordedMetric('readBytes')
            .addRecordedMetric('writeCount')
            .addRecordedMetric('writeBytes')
            .addQueriedMetric('batchManager', () => this.batchManager.metrics())
        this.on('read', (streamMessage) => {
            cassandraMetrics.record('readCount', 1)
            cassandraMetrics.record('readBytes', streamMessage.getContent(false).length)
        })
        this.on('write', (streamMessage) => {
            cassandraMetrics.record('writeCount', 1)
            cassandraMetrics.record('writeBytes', streamMessage.getContent(false).length)
        })
    }

    close() {
        const keys = [...this.pendingStores.keys()]
        keys.forEach((key) => {
            const timeout = this.pendingStores.get(key)
            clearTimeout(timeout)
            this.pendingStores.delete(key)
        })

        this.bucketManager.stop()
        this.batchManager.stop()
        return this.cassandraClient.shutdown()
    }

    _fetchFromTimestamp(streamId, partition, fromTimestamp) {
        const resultStream = this._createResultStream()

        const query = 'SELECT payload FROM stream_data WHERE '
            + 'stream_id = ? AND partition = ? AND bucket_id IN ? AND ts >= ?'

        this.bucketManager.getLastBuckets(streamId, partition, 1, fromTimestamp).then((buckets) => {
            return buckets.length ? buckets[0].dateCreate : fromTimestamp
        }).then((startBucketTimestamp) => {
            return this.bucketManager.getBucketsByTimestamp(streamId, partition, startBucketTimestamp)
        }).then((buckets) => {
            if (!buckets || !buckets.length) {
                throw new Error('Failed to find buckets')
            }

            const bucketsForQuery = bucketsToIds(buckets)

            const queryParams = [streamId, partition, bucketsForQuery, fromTimestamp]
            const cassandraStream = this._queryWithStreamingResults(query, queryParams)

            return pump(
                cassandraStream,
                resultStream,
                (err) => {
                    if (err) {
                        logger.error('pump finished with error', err)
                        resultStream.push(null)
                    }
                }
            )
        })
            .catch((e) => {
                logger.warn(e)
                resultStream.push(null)
            })

        return resultStream
    }

    _fetchFromMessageRefForPublisher(streamId, partition, fromTimestamp, fromSequenceNo, publisherId, msgChainId) {
        const resultStream = this._createResultStream()

        const query1 = 'SELECT payload FROM stream_data WHERE stream_id = ? AND partition = ? AND bucket_id IN ? AND ts = ? AND sequence_no >= ? AND publisher_id = ? '
            + 'AND msg_chain_id = ? ALLOW FILTERING'
        const query2 = 'SELECT payload FROM stream_data WHERE stream_id = ? AND partition = ? AND bucket_id IN ? AND ts > ? AND publisher_id = ? '
            + 'AND msg_chain_id = ? ALLOW FILTERING'

        this.bucketManager.getLastBuckets(streamId, partition, 1, fromTimestamp).then((buckets) => {
            return buckets.length ? buckets[0].dateCreate : fromTimestamp
        }).then((startBucketTimestamp) => {
            return this.bucketManager.getBucketsByTimestamp(streamId, partition, startBucketTimestamp)
        }).then((buckets) => {
            if (!buckets || !buckets.length) {
                throw new Error('Failed to find buckets')
            }

            const bucketsForQuery = bucketsToIds(buckets)

            const queryParams1 = [streamId, partition, bucketsForQuery, fromTimestamp, fromSequenceNo, publisherId, msgChainId]
            const queryParams2 = [streamId, partition, bucketsForQuery, fromTimestamp, publisherId, msgChainId]
            const stream1 = this._queryWithStreamingResults(query1, queryParams1)
            const stream2 = this._queryWithStreamingResults(query2, queryParams2)

            return pump(
                merge2(stream1, stream2),
                resultStream,
                (err) => {
                    if (err) {
                        logger.error('pump finished with error', err)
                        resultStream.push(null)
                    }
                }
            )
        })
            .catch((e) => {
                logger.warn(e)
                resultStream.push(null)
            })

        return resultStream
    }

    _fetchBetweenTimestamps(streamId, partition, fromTimestamp, toTimestamp) {
        const resultStream = this._createResultStream()

        const query = 'SELECT payload FROM stream_data WHERE '
            + 'stream_id = ? AND partition = ? AND bucket_id IN ? AND ts >= ? AND ts <= ?'

        Promise.all([
            this.bucketManager.getLastBuckets(streamId, partition, 1, fromTimestamp),
            this.bucketManager.getLastBuckets(streamId, partition, 1, toTimestamp),
        ]).then((results) => {
            if (!results || results.length !== 2) {
                throw new Error('Failed to find buckets')
            }

            const date1 = results[0][0].dateCreate
            const date2 = results[1][0].dateCreate
            return [Math.min(date1, date2), Math.max(date1, date2)]
        }).then(([startBucketDate, endBucketDate]) => {
            return this.bucketManager.getBucketsByTimestamp(streamId, partition, startBucketDate, endBucketDate)
        }).then((buckets) => {
            if (!buckets || !buckets.length) {
                throw new Error('Failed to find buckets')
            }

            const bucketsForQuery = bucketsToIds(buckets)

            const queryParams = [streamId, partition, bucketsForQuery, fromTimestamp, toTimestamp]
            const cassandraStream = this._queryWithStreamingResults(query, queryParams)

            return pump(
                cassandraStream,
                resultStream,
                (err) => {
                    if (err) {
                        logger.error('pump finished with error', err)
                        resultStream.push(null)
                    }
                }
            )
        })
            .catch((e) => {
                logger.warn(e)
                resultStream.push(null)
            })

        return resultStream
    }

    _fetchBetweenMessageRefsForPublisher(streamId, partition, fromTimestamp, fromSequenceNo, toTimestamp, toSequenceNo, publisherId, msgChainId) {
        const resultStream = this._createResultStream()

        const query1 = 'SELECT payload FROM stream_data WHERE stream_id = ? AND partition = ? AND bucket_id IN ? AND ts = ? AND sequence_no >= ? AND publisher_id = ? '
            + 'AND msg_chain_id = ? ALLOW FILTERING'
        const query2 = 'SELECT payload FROM stream_data WHERE stream_id = ? AND partition = ? AND bucket_id IN ? AND ts > ? AND ts < ? AND publisher_id = ? '
            + 'AND msg_chain_id = ? ALLOW FILTERING'
        const query3 = 'SELECT payload FROM stream_data WHERE stream_id = ? AND partition = ? AND bucket_id IN ? AND ts = ? AND sequence_no <= ? AND publisher_id = ? '
            + 'AND msg_chain_id = ? ALLOW FILTERING'

        // TODO replace with allSettled
        Promise.all([
            this.bucketManager.getLastBuckets(streamId, partition, 1, fromTimestamp),
            this.bucketManager.getLastBuckets(streamId, partition, 1, toTimestamp),
        ]).then((results) => {
            if (!results || results.length !== 2) {
                throw new Error('Failed to find buckets')
            }

            const date1 = results[0][0].dateCreate
            const date2 = results[1][0].dateCreate
            return [Math.min(date1, date2), Math.max(date1, date2)]
        }).then(([startBucketDate, endBucketDate]) => {
            return this.bucketManager.getBucketsByTimestamp(streamId, partition, startBucketDate, endBucketDate)
        }).then((buckets) => {
            if (!buckets || !buckets.length) {
                throw new Error('Failed to find buckets')
            }

            const bucketsForQuery = bucketsToIds(buckets)

            const queryParams1 = [streamId, partition, bucketsForQuery, fromTimestamp, fromSequenceNo, publisherId, msgChainId]
            const queryParams2 = [streamId, partition, bucketsForQuery, fromTimestamp, toTimestamp, publisherId, msgChainId]
            const queryParams3 = [streamId, partition, bucketsForQuery, toTimestamp, toSequenceNo, publisherId, msgChainId]
            const stream1 = this._queryWithStreamingResults(query1, queryParams1)
            const stream2 = this._queryWithStreamingResults(query2, queryParams2)
            const stream3 = this._queryWithStreamingResults(query3, queryParams3)

            return pump(
                merge2(stream1, stream2, stream3),
                resultStream,
                (err) => {
                    if (err) {
                        logger.error('pump finished with error', err)
                        resultStream.push(null)
                    }
                }
            )
        })
            .catch((e) => {
                logger.warn(e)
                resultStream.push(null)
            })

        return resultStream
    }

    _queryWithStreamingResults(query, queryParams) {
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
                cassandraStream.pause()
                setImmediate(() => cassandraStream.resume())
            }
        }).on('error', (err) => {
            logger.error(err)
        })

        return cassandraStream
    }

    _parseRow(row) {
        const streamMessage = StreamMessage.deserialize(row.payload.toString())
        this.emit('read', streamMessage)
        return streamMessage
    }

    _createResultStream() {
        return new Transform({
            objectMode: true,
            transform: (row, _, done) => {
                done(null, this._parseRow(row))
            }
        })
    }

    async getFirstMessageTimestampInStream(streamId, partition) {
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

    async getLastMessageTimestampInStream(streamId, partition) {
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

    async getNumberOfMessagesInStream(streamId, partition) {
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

    async getTotalBytesInStream(streamId, partition) {
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

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

const startCassandraStorage = async ({
    contactPoints,
    localDataCenter,
    keyspace,
    username,
    password,
    opts
}) => {
    const authProvider = new cassandra.auth.PlainTextAuthProvider(username || '', password || '')
    const requestLogger = new cassandra.tracker.RequestLogger({
        slowThreshold: 10 * 1000, // 10 secs
    })
    requestLogger.emitter.on('slow', (message) => logger.warn(message))
    const cassandraClient = new cassandra.Client({
        contactPoints,
        localDataCenter,
        keyspace,
        authProvider,
        requestLogger,
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
            await cassandraClient.connect().catch((err) => { throw err })
            return new Storage(cassandraClient, opts || {})
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

module.exports = {
    Storage,
    startCassandraStorage,
}
