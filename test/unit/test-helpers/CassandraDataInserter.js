const StreamrBinaryMessage = require('../../../src/protocol/StreamrBinaryMessage')
const StreamrBinaryMessageWithKafkaMetadata = require('../../../src/protocol/StreamrBinaryMessageWithKafkaMetadata')

/**
 * Used to populate Cassandra with pre-defined messages for testing purposes.
*/
module.exports = class CassandraDataInserter {
    constructor(client, streamId) {
        if (!client) {
            throw new Error('Cassandra client not given!')
        }
        if (!streamId) {
            throw new Error('streamId not given!')
        }

        this.client = client
        this.streamId = streamId

        this.index = 1
        this.offset = 5
        this.previousOffset = -1

        this.insertedMessages = []
    }

    timedBulkInsert(n, timeoutInMs) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                this.bulkInsert(n)
                    .then(resolve)
                    .catch(reject)
            }, timeoutInMs)
        })
    }

    bulkInsert(n) {
        const promises = []
        for (let i = 0; i < n; ++i) {
            Array.prototype.push.apply(promises, this.insertData())
        }
        return Promise.all(promises)
    }

    insertData() {
        const partition = 0
        const timestamp = 1490180400000 + (this.index * 60 * 1000)
        const ttl = 10
        const contentType = StreamrBinaryMessage.CONTENT_TYPE_JSON
        const content = {
            key: `msg-${this.index}`,
        }
        const msg = new StreamrBinaryMessage(this.streamId, partition, timestamp, ttl, contentType, Buffer.from(JSON.stringify(content), 'utf8'))
        this.insertedMessages.push(new StreamrBinaryMessageWithKafkaMetadata(msg, this.offset, this.previousOffset, 0))

        const promises = []
        promises.push(this.client.execute(
            'INSERT INTO stream_events' +
            '(stream, stream_partition, kafka_partition, kafka_offset, previous_offset, ts, payload)' +
            ' VALUES (?, ?, ?, ?, ?, ?, ?) USING TTL 60',
            [this.streamId, partition, 0, this.offset, this.previousOffset, timestamp, msg.toBytes()], {
                prepare: true,
            },
        ))
        promises.push(this.client.execute('INSERT INTO stream_timestamps' +
            ' (stream, stream_partition, kafka_offset, ts)' +
            ' VALUES (?, ?, ?, ?) USING TTL 60', [this.streamId, partition, this.offset, timestamp], {
            prepare: true,
        }))

        this.previousOffset = this.offset
        this.offset += 5
        this.index += 1

        return promises
    }
}
