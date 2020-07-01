const { Transform } = require('stream')
const EventEmitter = require('events')

const pump = require('pump')
const merge2 = require('merge2')
const debug = require('debug')('streamr:storage')
const cassandra = require('cassandra-driver')
const { StreamMessage } = require('streamr-network').Protocol.MessageLayer

const BatchManager = require('./BatchManager')
const PeriodicQuery = require('./PeriodicQuery')

const RANGE_THRESHOLD = 30 * 1000
const RETRY_INTERVAL = 2000
const RETRY_TIMEOUT = 15 * 1000
const MAX_RESEND_LAST = 10000

class Storage extends EventEmitter {
    constructor(cassandraClient, opts) {
        super()

        const defaultOptions = {
            batchManagerOpts: {
                useTtl: false
            }
        }

        this.opts = {
            ...defaultOptions,
            ...opts
        }

        this.cassandraClient = cassandraClient
        this.batchManager = new BatchManager(cassandraClient, this.opts.batchManagerOpts)
    }

    store(streamMessage) {
        // TODO in next PR will be added BucketManager
        const bucketId = `${streamMessage.getStreamId()}::${streamMessage.getStreamPartition()}`

        if (bucketId) {
            debug(`found bucketId: ${bucketId}`)
            setImmediate(() => {
                this.emit('write', streamMessage)
                this.batchManager.store(bucketId, streamMessage)
            })
        } else {
            const messageId = streamMessage.messageId.serialize()
            debug(`bucket not found, put ${messageId} to pendingMessages`)
        }
    }

    requestLast(streamId, partition, limit) {
        if (limit > MAX_RESEND_LAST) {
            // eslint-disable-next-line no-param-reassign
            limit = MAX_RESEND_LAST
        }

        debug(`requestLast, streamId: "${streamId}", partition: "${partition}", limit: "${limit}"`)

        const resultStream = this._createResultStream()

        const query = 'SELECT payload FROM stream_data '
            + 'WHERE id = ? AND partition = ? '
            + 'ORDER BY ts DESC, sequence_no DESC '
            + 'LIMIT ?'
        const queryParams = [streamId, partition, limit]

        this.cassandraClient.execute(query, queryParams, {
            prepare: true,
            fetchSize: 0 // disable paging to get more that 5000 (https://github.com/datastax/nodejs-driver#paging)
        })
            .then((resultSet) => {
                resultSet.rows.reverse().forEach((r) => {
                    resultStream.push(this._parseRow(r))
                })
                resultStream.push(null)
            })
            .catch((err) => {
                console.error(err)
                resultStream.push(null)
            })

        return resultStream
    }

    requestFrom(streamId, partition, fromTimestamp, fromSequenceNo, publisherId, msgChainId) {
        debug(`requestFrom, streamId: "${streamId}", partition: "${partition}", fromTimestamp: "${fromTimestamp}", fromSequenceNo: `
            + `"${fromSequenceNo}", publisherId: "${publisherId}", msgChainId: "${msgChainId}"`)

        if (fromSequenceNo != null && (!Number.isInteger(fromSequenceNo) || parseInt(fromSequenceNo) < 0)) {
            throw new Error('fromSequenceNo must be positive')
        }

        if (fromSequenceNo != null && publisherId != null && msgChainId != null) {
            return this._fetchFromMessageRefForPublisher(streamId, partition, fromTimestamp,
                fromSequenceNo, publisherId, msgChainId)
        }
        if ((fromSequenceNo == null || fromSequenceNo === 0) && publisherId == null && msgChainId == null) {
            return this._fetchFromTimestamp(streamId, partition, fromTimestamp)
        }

        throw new Error('Invalid combination of requestFrom arguments')
    }

    _fetchFromTimestamp(streamId, streamPartition, fromTimestamp) {
        const resultStream = this._createResultStream()

        const query = 'SELECT payload FROM stream_data WHERE id = ? AND partition = ? AND ts >= ? ORDER BY ts ASC, sequence_no ASC'
        const queryParams = [streamId, streamPartition, fromTimestamp]
        const cassandraStream = this._queryWithStreamingResults(query, queryParams)

        pump(
            cassandraStream,
            resultStream,
            (err) => {
                if (err) {
                    console.error('pump finished with error', err)
                    resultStream.push(null)
                }
            }
        )

        return resultStream
    }

    _fetchFromMessageRefForPublisher(streamId, streamPartition, fromTimestamp, fromSequenceNo, publisherId, msgChainId) {
        const resultStream = this._createResultStream()

        // Cassandra doesn't allow ORs in WHERE clause so we need to do 2 queries.
        // Once a range (id/partition/ts/sequence_no) has been selected in Cassandra, filtering it by publisher_id requires to ALLOW FILTERING.
        const query1 = 'SELECT payload FROM stream_data WHERE id = ? AND partition = ? AND ts = ? AND sequence_no >= ? AND publisher_id = ? '
            + 'AND msg_chain_id = ? ORDER BY ts ASC, sequence_no ASC ALLOW FILTERING'
        const query2 = 'SELECT payload FROM stream_data WHERE id = ? AND partition = ? AND ts > ? AND publisher_id = ? '
            + 'AND msg_chain_id = ? ORDER BY ts ASC, sequence_no ASC ALLOW FILTERING'
        const queryParams1 = [streamId, streamPartition, fromTimestamp, fromSequenceNo, publisherId, msgChainId]
        const queryParams2 = [streamId, streamPartition, fromTimestamp, publisherId, msgChainId]
        const stream1 = this._queryWithStreamingResults(query1, queryParams1)
        const stream2 = this._queryWithStreamingResults(query2, queryParams2)

        pump(
            merge2(stream1, stream2),
            resultStream,
            (err) => {
                if (err) {
                    console.error('pump finished with error', err)
                    resultStream.push(null)
                }
            }
        )

        return resultStream
    }

    requestRange(streamId, partition, fromTimestamp, fromSequenceNo, toTimestamp, toSequenceNo, publisherId, msgChainId) {
        debug(`requestRange, streamId: "${streamId}", partition: "${partition}", fromTimestamp: "${fromTimestamp}", fromSequenceNo: "${fromSequenceNo}"`
            + `, toTimestamp: "${toTimestamp}", toSequenceNo: "${toSequenceNo}", publisherId: "${publisherId}", msgChainId: "${msgChainId}"`)

        if (fromSequenceNo != null && toSequenceNo != null && publisherId != null && msgChainId != null) {
            if (toTimestamp > (Date.now() - RANGE_THRESHOLD)) {
                const periodicQuery = new PeriodicQuery(() => this._fetchBetweenMessageRefsForPublisher(streamId, partition, fromTimestamp,
                    fromSequenceNo, toTimestamp, toSequenceNo, publisherId, msgChainId), RETRY_INTERVAL, RETRY_TIMEOUT)
                return periodicQuery.getStreamingResults()
            }
            return this._fetchBetweenMessageRefsForPublisher(streamId, partition, fromTimestamp,
                fromSequenceNo, toTimestamp, toSequenceNo, publisherId, msgChainId)
        }
        if ((fromSequenceNo == null || fromSequenceNo === 0) && (toSequenceNo == null || toSequenceNo === 0)
            && publisherId == null && msgChainId == null) {
            return this._fetchBetweenTimestamps(streamId, partition, fromTimestamp, toTimestamp)
        }

        throw new Error('Invalid combination of requestFrom arguments')
    }

    _fetchBetweenTimestamps(streamId, streamPartition, from, to) {
        const resultStream = this._createResultStream()

        const query = 'SELECT payload FROM stream_data WHERE id = ? AND partition = ? AND ts >= ? AND ts <= ? ORDER BY ts ASC, sequence_no ASC'
        const queryParams = [streamId, streamPartition, from, to]
        const cassandraStream = this._queryWithStreamingResults(query, queryParams)

        pump(
            cassandraStream,
            resultStream,
            (err) => {
                if (err) {
                    console.error('pump finished with error', err)
                    resultStream.push(null)
                }
            }
        )

        return resultStream
    }

    _fetchBetweenMessageRefsForPublisher(streamId, partition, fromTimestamp, fromSequenceNo, toTimestamp, toSequenceNo, publisherId, msgChainId) {
        const resultStream = this._createResultStream()

        // Cassandra doesn't allow ORs in WHERE clause so we need to do 3 queries.
        // Once a range (id/partition/ts/sequence_no) has been selected in Cassandra, filtering it by publisher_id requires to ALLOW FILTERING.
        const query1 = 'SELECT payload FROM stream_data WHERE id = ? AND partition = ? AND ts = ? AND sequence_no >= ? AND publisher_id = ? '
            + 'AND msg_chain_id = ? ORDER BY ts ASC, sequence_no ASC ALLOW FILTERING'
        const query2 = 'SELECT payload FROM stream_data WHERE id = ? AND partition = ? AND ts > ? AND ts < ? AND publisher_id = ? '
            + 'AND msg_chain_id = ? ORDER BY ts ASC, sequence_no ASC ALLOW FILTERING'
        const query3 = 'SELECT payload FROM stream_data WHERE id = ? AND partition = ? AND ts = ? AND sequence_no <= ? AND publisher_id = ? '
            + 'AND msg_chain_id = ? ORDER BY ts ASC, sequence_no ASC ALLOW FILTERING'
        const queryParams1 = [streamId, partition, fromTimestamp, fromSequenceNo, publisherId, msgChainId]
        const queryParams2 = [streamId, partition, fromTimestamp, toTimestamp, publisherId, msgChainId]
        const queryParams3 = [streamId, partition, toTimestamp, toSequenceNo, publisherId, msgChainId]
        const stream1 = this._queryWithStreamingResults(query1, queryParams1)
        const stream2 = this._queryWithStreamingResults(query2, queryParams2)
        const stream3 = this._queryWithStreamingResults(query3, queryParams3)

        pump(
            merge2(stream1, stream2, stream3),
            resultStream,
            (err) => {
                if (err) {
                    console.error('pump finished with error', err)
                    resultStream.push(null)
                }
            }
        )

        return resultStream
    }

    metrics() {
        return {
            batchManager: this.batchManager.metrics()
        }
    }

    close() {
        this.batchManager.stop()
        return this.cassandraClient.shutdown()
    }

    _queryWithStreamingResults(query, queryParams) {
        const cassandraStream = this.cassandraClient.stream(query, queryParams, {
            prepare: true,
            autoPage: true
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
            console.error(err)
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
    batchManagerOpts
}) => {
    const authProvider = new cassandra.auth.PlainTextAuthProvider(username || '', password || '')
    const requestLogger = new cassandra.tracker.RequestLogger({
        slowThreshold: 10 * 1000, // 10 secs
    })
    requestLogger.emitter.on('slow', (message) => console.warn(message))
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

            const opts = {
                batchManagerOpts: batchManagerOpts || {}
            }
            return new Storage(cassandraClient, opts)
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
