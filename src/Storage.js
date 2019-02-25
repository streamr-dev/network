const { Readable, Transform } = require('stream')
const merge2 = require('merge2')
const cassandra = require('cassandra-driver')
const { StreamMessageFactory } = require('streamr-client-protocol').MessageLayer

const parseRow = (row) => StreamMessageFactory.deserialize(row.payload.toString())

class Storage {
    constructor(cassandraClient) {
        this.cassandraClient = cassandraClient
    }

    store(streamMessage) {
        const insertStatement = 'INSERT INTO stream_data (id, partition, ts, sequence_no, publisher_id, msg_chain_id, payload) ' +
            'VALUES (?, ?, ?, ?, ?, ?, ?)'
        return this.cassandraClient.execute(insertStatement, [
            streamMessage.getStreamId(),
            streamMessage.getStreamPartition(),
            streamMessage.getTimestamp(),
            streamMessage.messageId.sequenceNumber,
            streamMessage.getPublisherId(),
            streamMessage.messageId.msgChainId,
            Buffer.from(streamMessage.serialize()),
        ], {
            prepare: true,
        })
    }

    fetchLatest(streamId, streamPartition, n) {
        if (!Number.isInteger(n)) {
            throw new Error('n is not an integer')
        }
        const query = 'SELECT * FROM stream_data WHERE id = ? AND partition = ? ORDER BY ts DESC, sequence_no DESC LIMIT ?'
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

    fetchFromTimestamp(streamId, streamPartition, from) {
        if (!Number.isInteger(from)) {
            throw new Error('from is not an integer')
        }

        const query = 'SELECT * FROM stream_data WHERE id = ? AND partition = ? AND ts >= ? ORDER BY ts ASC, sequence_no ASC'
        const queryParams = [streamId, streamPartition, from]
        return this._queryWithStreamingResults(query, queryParams)
    }

    fetchFromMessageRefForPublisher(streamId, streamPartition, fromMsgRef, publisherId, msgChainId) {
        // Cassandra doesn't allow ORs in WHERE clause so we need to do 2 queries.
        // Once a range (id/partition/ts/sequence_no) has been selected in Cassandra, filtering it by publisher_id requires to ALLOW FILTERING.
        const query1 = 'SELECT * FROM stream_data WHERE id = ? AND partition = ? AND ts = ? AND sequence_no >= ? AND publisher_id = ? ' +
            'AND msg_chain_id = ? ORDER BY ts ASC, sequence_no ASC ALLOW FILTERING'
        const query2 = 'SELECT * FROM stream_data WHERE id = ? AND partition = ? AND ts > ? AND publisher_id = ? ' +
            'AND msg_chain_id = ? ORDER BY ts ASC, sequence_no ASC ALLOW FILTERING'
        const queryParams1 = [streamId, streamPartition, fromMsgRef.timestamp, fromMsgRef.sequenceNumber, publisherId, msgChainId]
        const queryParams2 = [streamId, streamPartition, fromMsgRef.timestamp, publisherId, msgChainId]
        const stream1 = this._queryWithStreamingResults(query1, queryParams1)
        const stream2 = this._queryWithStreamingResults(query2, queryParams2)
        return merge2(stream1, stream2)
    }

    fetchBetweenTimestamps(streamId, streamPartition, from, to) {
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

    fetchBetweenMessageRefsForPublisher(streamId, streamPartition, fromMsgRef, toMsgRef, publisherId, msgChainId) {
        // Cassandra doesn't allow ORs in WHERE clause so we need to do 3 queries.
        // Once a range (id/partition/ts/sequence_no) has been selected in Cassandra, filtering it by publisher_id requires to ALLOW FILTERING.
        const query1 = 'SELECT * FROM stream_data WHERE id = ? AND partition = ? AND ts = ? AND sequence_no >= ? AND publisher_id = ? ' +
            'AND msg_chain_id = ? ORDER BY ts ASC, sequence_no ASC ALLOW FILTERING'
        const query2 = 'SELECT * FROM stream_data WHERE id = ? AND partition = ? AND ts > ? AND ts < ? AND publisher_id = ? ' +
            'AND msg_chain_id = ? ORDER BY ts ASC, sequence_no ASC ALLOW FILTERING'
        const query3 = 'SELECT * FROM stream_data WHERE id = ? AND partition = ? AND ts = ? AND sequence_no <= ? AND publisher_id = ? ' +
            'AND msg_chain_id = ? ORDER BY ts ASC, sequence_no ASC ALLOW FILTERING'
        const queryParams1 = [streamId, streamPartition, fromMsgRef.timestamp, fromMsgRef.sequenceNumber, publisherId, msgChainId]
        const queryParams2 = [streamId, streamPartition, fromMsgRef.timestamp, toMsgRef.timestamp, publisherId, msgChainId]
        const queryParams3 = [streamId, streamPartition, toMsgRef.timestamp, toMsgRef.sequenceNumber, publisherId, msgChainId]
        const stream1 = this._queryWithStreamingResults(query1, queryParams1)
        const stream2 = this._queryWithStreamingResults(query2, queryParams2)
        const stream3 = this._queryWithStreamingResults(query3, queryParams3)
        return merge2(stream1, stream2, stream3)
    }

    close() {
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

const startCassandraStorage = async (contactPoints, localDataCenter, keyspace) => {
    const cassandraClient = new cassandra.Client({
        contactPoints,
        localDataCenter,
        keyspace,
    })
    await cassandraClient.connect()
    return new Storage(cassandraClient)
}

module.exports = {
    Storage,
    startCassandraStorage,
}
