const { Readable, Transform } = require('stream')

const merge2 = require('merge2')
const cassandra = require('cassandra-driver')
const { StreamMessageFactory } = require('streamr-client-protocol').MessageLayer

const MicroBatchingStrategy = require('./MicroBatchingStrategy')

const INSERT_STATEMENT = 'INSERT INTO stream_data '
    + '(id, partition, ts, sequence_no, publisher_id, msg_chain_id, payload) '
    + 'VALUES (?, ?, ?, ?, ?, ?, ?)'

const INSERT_STATEMENT_WITH_TTL = 'INSERT INTO stream_data '
    + '(id, partition, ts, sequence_no, publisher_id, msg_chain_id, payload) '
    + 'VALUES (?, ?, ?, ?, ?, ?, ?) USING TTL 259200' // 3 days

const batchingStore = (cassandraClient, insertStatement) => new MicroBatchingStrategy({
    insertFn: (streamMessages) => {
        const queries = streamMessages.map((streamMessage) => {
            return {
                query: insertStatement,
                params: [
                    streamMessage.getStreamId(),
                    streamMessage.getStreamPartition(),
                    streamMessage.getTimestamp(),
                    streamMessage.getSequenceNumber(),
                    streamMessage.getPublisherId(),
                    streamMessage.getMsgChainId(),
                    Buffer.from(streamMessage.serialize()),
                ]
            }
        })
        return cassandraClient.batch(queries, {
            prepare: true
        })
    }
})

const individualStore = (cassandraClient, insertStatement) => ({
    store: (streamMessage) => {
        return cassandraClient.execute(insertStatement, [
            streamMessage.getStreamId(),
            streamMessage.getStreamPartition(),
            streamMessage.getTimestamp(),
            streamMessage.getSequenceNumber(),
            streamMessage.getPublisherId(),
            streamMessage.getMsgChainId(),
            Buffer.from(streamMessage.serialize()),
        ], {
            prepare: true,
        })
    },
    close: () => {}
})

const parseRow = (row) => {
    const streamMessage = StreamMessageFactory.deserialize(row.payload.toString())
    return {
        streamId: streamMessage.getStreamId(),
        streamPartition: streamMessage.getStreamPartition(),
        timestamp: streamMessage.getTimestamp(),
        sequenceNo: streamMessage.getSequenceNumber(),
        publisherId: streamMessage.getPublisherId(),
        msgChainId: streamMessage.getMsgChainId(),
        previousTimestamp: streamMessage.prevMsgRef ? streamMessage.prevMsgRef.timestamp : null,
        previousSequenceNo: streamMessage.prevMsgRef ? streamMessage.prevMsgRef.sequenceNumber : null,
        data: streamMessage.getParsedContent(),
        signature: streamMessage.signature,
        signatureType: streamMessage.signatureType,
    }
}

class Storage {
    constructor(cassandraClient, useTtl, isBatching = true) {
        this.cassandraClient = cassandraClient
        const insertStatement = useTtl ? INSERT_STATEMENT_WITH_TTL : INSERT_STATEMENT
        if (isBatching) {
            this.storeStrategy = batchingStore(cassandraClient, insertStatement)
        } else {
            this.storeStrategy = individualStore(cassandraClient, insertStatement)
        }
    }

    store(streamMessage) {
        return this.storeStrategy.store(streamMessage)
    }

    requestLast(streamId, streamPartition, n) {
        // TODO replace with protocol validations.js
        if (!Number.isInteger(streamPartition) || parseInt(streamPartition) < 0) {
            throw new Error('streamPartition must be >= 0')
        }

        if (!Number.isInteger(n) || parseInt(n) <= 0) {
            throw new Error('LIMIT must be strictly positive')
        }
        const query = 'SELECT * FROM stream_data '
            + 'WHERE id = ? AND partition = ? '
            + 'ORDER BY ts DESC, sequence_no DESC '
            + 'LIMIT ?'
        const queryParams = [streamId, streamPartition, n]

        // Wrap as stream for consistency with other fetch functions
        const readableStream = new Readable({
            objectMode: true,
            read() {},
        })

        this.cassandraClient.execute(query, queryParams, {
            prepare: true,
        })
            .then((resultSet) => {
                resultSet.rows.reverse().forEach((r) => readableStream.push(parseRow(r)))
                readableStream.push(null)
            })
            .catch((err) => {
                readableStream.emit('error', err)
            })

        return readableStream
    }

    requestFrom(streamId, streamPartition, fromTimestamp, fromSequenceNo, publisherId, msgChainId) {
        // TODO replace with protocol validations.js
        if (!Number.isInteger(streamPartition) || parseInt(streamPartition) < 0) {
            throw new Error('streamPartition must be >= 0')
        }

        if (!Number.isInteger(fromTimestamp) || parseInt(fromTimestamp) <= 0) {
            throw new Error('fromTimestamp must be strictly positive')
        }
        if (fromSequenceNo != null && (!Number.isInteger(fromSequenceNo) || parseInt(fromSequenceNo) < 0)) {
            throw new Error('fromSequenceNo must be positive')
        }

        if (fromSequenceNo != null && publisherId != null && msgChainId != null) {
            return this._fetchFromMessageRefForPublisher(streamId, streamPartition, fromTimestamp,
                fromSequenceNo, publisherId, msgChainId)
        }
        if ((fromSequenceNo == null || fromSequenceNo === 0) && publisherId == null && msgChainId == null) {
            return this._fetchFromTimestamp(streamId, streamPartition, fromTimestamp)
        }

        throw new Error('Invalid combination of requestFrom arguments')
    }

    _fetchFromTimestamp(streamId, streamPartition, from) {
        // TODO replace with protocol validations.js
        if (!Number.isInteger(streamPartition) || parseInt(streamPartition) < 0) {
            throw new Error('streamPartition must be >= 0')
        }

        if (!Number.isInteger(from) || Number.isInteger(from) <= 0) {
            throw new Error('from must be strictly positive')
        }

        const query = 'SELECT * FROM stream_data WHERE id = ? AND partition = ? AND ts >= ? ORDER BY ts ASC, sequence_no ASC'
        const queryParams = [streamId, streamPartition, from]
        return this._queryWithStreamingResults(query, queryParams)
    }

    _fetchFromMessageRefForPublisher(streamId, streamPartition, fromTimestamp, fromSequenceNo, publisherId, msgChainId) {
        // Cassandra doesn't allow ORs in WHERE clause so we need to do 2 queries.
        // Once a range (id/partition/ts/sequence_no) has been selected in Cassandra, filtering it by publisher_id requires to ALLOW FILTERING.
        const query1 = 'SELECT * FROM stream_data WHERE id = ? AND partition = ? AND ts = ? AND sequence_no >= ? AND publisher_id = ? '
            + 'AND msg_chain_id = ? ORDER BY ts ASC, sequence_no ASC ALLOW FILTERING'
        const query2 = 'SELECT * FROM stream_data WHERE id = ? AND partition = ? AND ts > ? AND publisher_id = ? '
            + 'AND msg_chain_id = ? ORDER BY ts ASC, sequence_no ASC ALLOW FILTERING'
        const queryParams1 = [streamId, streamPartition, fromTimestamp, fromSequenceNo, publisherId, msgChainId]
        const queryParams2 = [streamId, streamPartition, fromTimestamp, publisherId, msgChainId]
        const stream1 = this._queryWithStreamingResults(query1, queryParams1)
        const stream2 = this._queryWithStreamingResults(query2, queryParams2)
        return merge2(stream1, stream2)
    }

    requestRange(
        streamId,
        streamPartition,
        fromTimestamp,
        fromSequenceNo,
        toTimestamp,
        toSequenceNo,
        publisherId,
        msgChainId
    ) {
        if (!Number.isInteger(fromTimestamp)) {
            throw new Error('fromTimestamp is not an integer')
        }
        if (fromSequenceNo != null && !Number.isInteger(fromSequenceNo)) {
            throw new Error('fromSequenceNo is not an integer')
        }
        if (!Number.isInteger(toTimestamp)) {
            throw new Error('toTimestamp is not an integer')
        }
        if (toSequenceNo != null && !Number.isInteger(toSequenceNo)) {
            throw new Error('toSequenceNo is not an integer')
        }

        if (fromSequenceNo != null && toSequenceNo != null && publisherId != null && msgChainId != null) {
            return this._fetchBetweenMessageRefsForPublisher(streamId, streamPartition, fromTimestamp,
                fromSequenceNo, toTimestamp, toSequenceNo, publisherId, msgChainId)
        }
        if ((fromSequenceNo == null || fromSequenceNo === 0) && (toSequenceNo == null || toSequenceNo === 0)
            && publisherId == null && msgChainId == null) {
            return this._fetchBetweenTimestamps(streamId, streamPartition, fromTimestamp, toTimestamp)
        }

        throw new Error('Invalid combination of requestFrom arguments')
    }

    _fetchBetweenTimestamps(streamId, streamPartition, from, to) {
        if (!Number.isInteger(from)) {
            throw new Error('from is not an integer')
        }

        if (!Number.isInteger(to)) {
            throw new Error('to is not an integer')
        }

        const query = 'SELECT * FROM stream_data WHERE id = ? AND partition = ? AND ts >= ? AND ts <= ? ORDER BY ts ASC, sequence_no ASC'
        const queryParams = [streamId, streamPartition, from, to]
        return this._queryWithStreamingResults(query, queryParams)
    }

    _fetchBetweenMessageRefsForPublisher(
        streamId,
        streamPartition,
        fromTimestamp,
        fromSequenceNo,
        toTimestamp,
        toSequenceNo,
        publisherId,
        msgChainId
    ) {
        // Cassandra doesn't allow ORs in WHERE clause so we need to do 3 queries.
        // Once a range (id/partition/ts/sequence_no) has been selected in Cassandra, filtering it by publisher_id requires to ALLOW FILTERING.
        const query1 = 'SELECT * FROM stream_data WHERE id = ? AND partition = ? AND ts = ? AND sequence_no >= ? AND publisher_id = ? '
            + 'AND msg_chain_id = ? ORDER BY ts ASC, sequence_no ASC ALLOW FILTERING'
        const query2 = 'SELECT * FROM stream_data WHERE id = ? AND partition = ? AND ts > ? AND ts < ? AND publisher_id = ? '
            + 'AND msg_chain_id = ? ORDER BY ts ASC, sequence_no ASC ALLOW FILTERING'
        const query3 = 'SELECT * FROM stream_data WHERE id = ? AND partition = ? AND ts = ? AND sequence_no <= ? AND publisher_id = ? '
            + 'AND msg_chain_id = ? ORDER BY ts ASC, sequence_no ASC ALLOW FILTERING'
        const queryParams1 = [streamId, streamPartition, fromTimestamp, fromSequenceNo, publisherId, msgChainId]
        const queryParams2 = [streamId, streamPartition, fromTimestamp, toTimestamp, publisherId, msgChainId]
        const queryParams3 = [streamId, streamPartition, toTimestamp, toSequenceNo, publisherId, msgChainId]
        const stream1 = this._queryWithStreamingResults(query1, queryParams1)
        const stream2 = this._queryWithStreamingResults(query2, queryParams2)
        const stream3 = this._queryWithStreamingResults(query3, queryParams3)
        return merge2(stream1, stream2, stream3)
    }

    close() {
        this.storeStrategy.close()
        return this.cassandraClient.shutdown()
    }

    _queryWithStreamingResults(query, queryParams) {
        return this.cassandraClient.stream(query, queryParams, {
            prepare: true,
            autoPage: true,
        }).pipe(new Transform({
            objectMode: true,
            transform: (row, _, done) => {
                done(null, parseRow(row))
            },
        }))
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
    useTtl = true,
    isBatching = true
}) => {
    const authProvider = new cassandra.auth.PlainTextAuthProvider(username || '', password || '')
    const cassandraClient = new cassandra.Client({
        contactPoints,
        localDataCenter,
        keyspace,
        authProvider,
    })
    const nbTrials = 20
    let retryCount = nbTrials
    let lastError = ''
    while (retryCount > 0) {
        /* eslint-disable no-await-in-loop */
        try {
            await cassandraClient.connect().catch((err) => { throw err })
            return new Storage(cassandraClient, useTtl, isBatching)
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
