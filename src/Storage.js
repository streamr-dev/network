const { Transform } = require('stream')
const cassandra = require('cassandra-driver')

const callbackToPromise = (method, ...args) => {
    return new Promise((resolve, reject) => {
        return method(...args, (err, result) => {
            return err ? reject(err) : resolve(result)
        })
    })
}

const transformRowToMessage = new Transform({
    objectMode: true,
    transform: (row, _, done) => {
        done(null, {
            streamId: row.id,
            streamPartition: row.partition,
            ts: row.ts.getTime(),
            sequenceNo: row.sequence_no,
            publisherId: row.publisher_id,
            payload: row.payload.toString(),
        })
    },
})

class Storage {
    constructor(cassandraClient) {
        this.execute = cassandraClient.execute.bind(cassandraClient)
        this.shutdown = cassandraClient.shutdown.bind(cassandraClient)
        this.stream = cassandraClient.stream.bind(cassandraClient)
    }

    store(streamId, streamPartition, timestamp, sequenceNo, publisherId, payload) {
        const encodedPayload = Buffer.from(JSON.stringify(payload))

        const insertStatement = 'INSERT INTO stream_data (id, partition, ts, sequence_no, publisher_id, payload) VALUES (?, ?, ?, ?, ?, ?)'
        return callbackToPromise(this.execute, insertStatement, [
            streamId,
            streamPartition,
            timestamp,
            sequenceNo,
            publisherId,
            encodedPayload,
        ], {
            prepare: true,
        })
    }

    fetchFromTimestamp(streamId, streamPartition, from) {
        if (!Number.isInteger(from)) {
            throw new Error('from is not an integer')
        }

        const query = 'SELECT * FROM stream_data WHERE id = ? AND partition = ? AND ts >= ? ORDER BY ts ASC'
        const queryParams = [streamId, streamPartition, from]

        return this.stream(query, queryParams, {
            prepare: true,
            autoPage: true,
        }).pipe(transformRowToMessage)
    }

    close() {
        return this.shutdown()
    }
}

const startCassandraStorage = async (contactPoints, localDataCenter, keyspace) => {
    const cassandraClient = new cassandra.Client({
        contactPoints,
        localDataCenter,
        keyspace,
    })
    await callbackToPromise(cassandraClient.connect.bind(cassandraClient))
    return new Storage(cassandraClient)
}

module.exports = {
    Storage,
    startCassandraStorage,
}
