const StreamrBinaryMessage = require('../../../src/protocol/StreamrBinaryMessage')

/**
 * Used to populate Cassandra with pre-defined messages for testing purposes.
*/
module.exports = class CassandraDataInserter {
    constructor(client) {
        if (!client) {
            throw new Error('Cassandra client not given!')
        }
        this.client = client
        this.reset()
    }

    reset() {
        this.index = 1
        this.offset = 5
        this.previousOffset = -1
    }

    deleteData() {
        this.reset()
        return Promise.all([
            this.client.execute("DELETE FROM stream_timestamps WHERE stream = 'fake-stream-1' AND stream_partition = 0"),
            this.client.execute("DELETE FROM stream_events WHERE stream = 'fake-stream-1' AND stream_partition = 0"),
            new Promise((resolve, reject) => {
                let count = 0

                const getData = () => {
                    console.log('Querying data for fake-stream-1')
                    return this.client.execute("SELECT kafka_offset FROM stream_timestamps WHERE stream = 'fake-stream-1' AND stream_partition = 0")
                }
                const resolveIfEmpty = (result) => {
                    console.log('Results length is %d', result.rows.length)

                    if (result.rows.length) {
                        setTimeout(() => {
                            count += 1

                            console.log('Sleeping (attempt %d)', count)
                            if (count < 40) {
                                getData()
                                    .then(resolveIfEmpty)
                            } else {
                                reject(new Error('Timed out waiting for data to be empty!'))
                            }
                        }, 500)
                    } else {
                        resolve(result)
                    }
                }

                getData().then(resolveIfEmpty)
            }),
        ])
    }

    timedBulkInsert(n, timeoutInMs) {
        setTimeout(() => {
            this.bulkInsert(n)
                .then(() => {
                    console.info(`Pushed ${n} additional events`)
                })
                .catch((e) => {
                    console.error(e)
                })
        }, timeoutInMs)
    }

    bulkInsert(n) {
        const promises = []
        for (let i = 0; i < n; ++i) {
            Array.prototype.push.apply(promises, this.insertData())
        }
        return Promise.all(promises)
    }

    insertData() {
        const streamId = 'fake-stream-1'
        const partition = 0
        const timestamp = 1490180400000 + (this.index * 60 * 1000)
        const ttl = 10
        const contentType = StreamrBinaryMessage.CONTENT_TYPE_JSON
        const content = {
            key: `msg-${this.index}`,
        }
        const msg = new StreamrBinaryMessage(streamId, partition, timestamp, ttl, contentType, Buffer.from(JSON.stringify(content), 'utf8'))

        const promises = []
        promises.push(this.client.execute(
            'INSERT INTO stream_events' +
            '(stream, stream_partition, kafka_partition, kafka_offset, previous_offset, ts, payload)' +
            ' VALUES (?, ?, ?, ?, ?, ?, ?)',
            [streamId, partition, 0, this.offset, this.previousOffset, timestamp, msg.toBytes()], {
                prepare: true,
            },
        ))
        promises.push(this.client.execute('INSERT INTO stream_timestamps' +
            ' (stream, stream_partition, kafka_offset, ts)' +
            ' VALUES (?, ?, ?, ?)', [streamId, partition, this.offset, timestamp], {
            prepare: true,
        }))

        this.previousOffset = this.offset
        this.offset += 5
        this.index += 1

        return promises
    }
}
