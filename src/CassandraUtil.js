const events = require('events')
const cassandra = require('cassandra-driver')
const debug = require('debug')('CassandraUtil')
const StreamrBinaryMessageWithKafkaMetadata = require('./protocol/StreamrBinaryMessageWithKafkaMetadata')

const DEFAULT_OPTIONS = {
    maxRefetchRetries: 60,
    refetchInterval: 1000,
}

module.exports = class CassandraUtil extends events.EventEmitter {
    constructor(contactPoints, keyspace, options) {
        super()
        debug('Creating CassandraUtil: contactPoints: %o, keyspace: %s', contactPoints, keyspace)
        this.client = new cassandra.Client({
            contactPoints,
            keyspace,
        })
        this.options = Object.assign({}, DEFAULT_OPTIONS, options)
    }

    query(query, queryParams, lastKnownOffset, msgHandler, onDone, onMsgEnd, givenContext) {
        const ctx = givenContext || {
            streamId: queryParams[0],
            partition: queryParams[1],
            targetOffset: lastKnownOffset,
            currentOffset: null,
            msgHandler,
            onDone,
            onMsgEnd: onMsgEnd || (() => {}),
            refetchCount: 0,
        }
        this._doQuery(query, queryParams, msgHandler, (lastOffset) => {
            this._fetchMoreIfNeeded(lastOffset, ctx)
        })
    }

    _fetchMoreIfNeeded(offsetFromLastCassandraRead, ctx) {
        ctx.onMsgEnd(offsetFromLastCassandraRead)
        if (offsetFromLastCassandraRead != null) {
            ctx.currentOffset = offsetFromLastCassandraRead
        }
        const statusString = `(${ctx.currentOffset}->${ctx.targetOffset})`

        if (ctx.targetOffset == null || ctx.targetOffset <= ctx.currentOffset) {
            debug(`Cassandra is up to date on stream ${ctx.streamId}, partition ${ctx.partition} ${statusString}`)
            ctx.onDone(ctx.currentOffset)
        } else if (ctx.refetchCount === this.options.maxRefetchRetries) {
            this.emit('maxRefetchAttemptsReached', ctx)
            ctx.onDone(ctx.currentOffset)
        } else {
            debug(`Waiting for Cassandra to catch up on stream ${ctx.streamId}, partition ${ctx.partition} ${statusString}`)

            ctx.refetchCount += 1
            const f = this.getOffsetRange.bind(
                this, ctx.streamId, ctx.partition, ctx.currentOffset + 1, ctx.targetOffset,
                ctx.msgHandler, ctx.onDone, ctx.targetOffset, ctx,
            )
            setTimeout(f, this.options.refetchInterval)
        }
    }

    _doQuery(query, queryParams, msgHandler, onEndOfMessages) {
        let largestOffset = null
        this.client.stream(query, queryParams, {
            prepare: true, autoPage: true,
            // eslint-disable-next-line space-before-function-paren
        }).on('readable', function() {
            // Invoked as soon a row is received
            let row = this.read()
            while (row) {
                // Cassandra driver returns bigints as type Long. Convert them to Numbers for simplicity for now.
                // This only becomes a problem once they reach 2^52.
                const msg = new StreamrBinaryMessageWithKafkaMetadata(
                    row.payload, // binary blob containing the StreamrBinaryMessage
                    row.kafka_offset.toNumber(), // offset
                    row.previous_offset != null ? row.previous_offset.toNumber() : undefined, // prevOffset
                    undefined, // kafkaPartition, not needed nor fetched, can be added if needed
                )
                const offset = row.kafka_offset.toNumber()
                if (largestOffset === null || offset > largestOffset) {
                    largestOffset = offset
                }
                msgHandler(msg.toStreamMessage())

                row = this.read()
            }
        }).on('end', () => {
            onEndOfMessages(largestOffset)
        }).on('error', (err) => {
            console.error(err)
            onEndOfMessages(largestOffset, err)
        })
    }

    getLast(stream, streamPartition, count, msgHandler, doneCallback, latestKnownOffset) {
        let reverseMode = true
        let reversible = []

        // The results are reversed in memory, so hard limit number of results to 100k to avoid exhausting memory
        this.query(
            `SELECT kafka_offset, previous_offset, payload 
            FROM stream_events WHERE stream = ? AND stream_partition = ? 
            ORDER BY kafka_offset DESC LIMIT ?`,
            [stream, streamPartition, Math.min(count, 100000)],
            latestKnownOffset,
            (message) => {
                if (reverseMode) {
                    reversible.push(message)
                } else {
                    msgHandler(message)
                }
            },
            doneCallback,
            () => {
                reverseMode = false
                // Need to report the messages in reverse (asc) order
                for (let i = reversible.length - 1; i >= 0; i--) {
                    msgHandler(reversible[i])
                }
                reversible = []
            },
        )
    }

    getAll(stream, streamPartition, msgHandler, doneCallback, latestKnownOffset) {
        this.query(
            `SELECT kafka_offset, previous_offset, payload 
            FROM stream_events WHERE stream = ? AND stream_partition = ? 
            ORDER BY kafka_offset ASC`,
            [stream, streamPartition],
            latestKnownOffset,
            msgHandler,
            doneCallback,
        )
    }

    getFromOffset(stream, streamPartition, minOffset, msgHandler, doneCallback, latestKnownOffset) {
        this.query(
            `SELECT kafka_offset, previous_offset, payload 
            FROM stream_events WHERE stream = ? AND stream_partition = ? AND kafka_offset >= ? 
            ORDER BY kafka_offset ASC`,
            [stream, streamPartition, minOffset],
            latestKnownOffset,
            msgHandler,
            doneCallback,
        )
    }

    getOffsetRange(stream, streamPartition, minOffset, maxOffset, msgHandler, doneCallback, latestKnownOffset, ctx) {
        this.query(
            `SELECT kafka_offset, previous_offset, payload 
            FROM stream_events WHERE stream = ? AND stream_partition = ? AND kafka_offset >= ? AND kafka_offset <= ? 
            ORDER BY kafka_offset ASC`,
            [stream, streamPartition, minOffset, maxOffset],
            (latestKnownOffset != null && latestKnownOffset <= maxOffset ? latestKnownOffset : null),
            msgHandler,
            doneCallback,
            null,
            ctx,
        )
    }

    getFromTimestamp(stream, streamPartition, minTimestamp, msgHandler, doneCallback, latestKnownOffset) {
        this._getFirstOffsetAfter(stream, streamPartition, minTimestamp)
            .then((offset) => {
                if (offset === null) {
                    doneCallback(null)
                } else {
                    this.getFromOffset(stream, streamPartition, offset, msgHandler, doneCallback, latestKnownOffset)
                }
            })
            .catch((error) => {
                console.error(error)
                doneCallback(error)
            })
    }

    getTimestampRange(stream, streamPartition, minTimestamp, maxTimestamp, msgHandler, doneCallback) {
        Promise.all([
            this._getFirstOffsetAfter(stream, streamPartition, minTimestamp),
            this._getLastOffsetBefore(stream, streamPartition, maxTimestamp),
        ]).then((result) => {
            const minOffset = result[0]
            const maxOffset = result[1]
            if (minOffset == null || maxOffset == null) {
                doneCallback()
            } else {
                this.getOffsetRange(stream, streamPartition, minOffset, maxOffset, msgHandler, doneCallback)
            }
        })
    }

    _getFirstOffsetAfter(stream, streamPartition, minTimestamp) {
        return this.client.execute(
            'SELECT kafka_offset FROM stream_timestamps WHERE stream = ? AND stream_partition = ? AND ts >= ? ORDER BY ts ASC LIMIT 1',
            [stream, streamPartition, minTimestamp],
            {
                prepare: true, autopage: true,
            },
        ).then((result) => (result.rows.length > 0 ? result.rows[0].kafka_offset.toNumber() : null))
    }

    _getLastOffsetBefore(stream, streamPartition, maxTimestamp) {
        return this.client.execute(
            'SELECT kafka_offset FROM stream_timestamps WHERE stream = ? AND stream_partition = ? AND ts <= ? ORDER BY ts DESC LIMIT 1',
            [stream, streamPartition, maxTimestamp],
            {
                prepare: true, autopage: true,
            },
        ).then((result) => (result.rows.length > 0 ? result.rows[0].kafka_offset.toNumber() : null))
    }

    close(cb) {
        this.client.shutdown(cb)
    }
}
