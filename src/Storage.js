const cassandra = require('cassandra-driver')

const callbackToPromise = (method, ...args) => {
    return new Promise((resolve, reject) => {
        return method(...args, (err, result) => {
            return err ? reject(err) : resolve(result)
        })
    })
}

class Storage {
    constructor(cassandraClient) {
        this.execute = cassandraClient.execute.bind(cassandraClient)
        this.shutdown = cassandraClient.shutdown.bind(cassandraClient)
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
