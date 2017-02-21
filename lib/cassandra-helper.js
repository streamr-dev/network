const cassandra = require('cassandra-driver')
const StreamrBinaryMessageWithKafkaMetadata = require('./protocol/StreamrBinaryMessageWithKafkaMetadata')
const debug = require('debug')('CassandraHelper')

const RETRY_IN_MS = 200

// TODO: tests
function CassandraHelper(contactPoints, keyspace) {
	debug("Creating CassandraHelper: contactPoints: %o, keyspace: %s", contactPoints, keyspace)
	this.client = new cassandra.Client({
		contactPoints: contactPoints,
		keyspace: keyspace
	});
}

CassandraHelper.prototype.query = function(query, queryParams, lastKnownOffset, msgHandler, onDone) {
	const _this = this
	const done = lastKnownOffset === undefined ? onDone : function (lastOffset) {
		const streamId = queryParams[0]
		const partition = queryParams[1]

		if (lastKnownOffset === null || lastKnownOffset <= lastOffset) {
			debug("Cassandra is up to date on stream" + streamId + ", partition " + partition)
			onDone(lastOffset)
		} else {
			debug("Waiting for Cassandra to catch up on stream " + streamId + ", partition " + partition + " behind " +
				(lastKnownOffset - lastOffset) + " messages  (" + lastOffset + "->" + lastKnownOffset + ")")
			const f = _this.getOffsetRange.bind(_this, streamId, partition, lastOffset, lastKnownOffset, msgHandler, onDone, lastKnownOffset)
			setTimeout(f, RETRY_IN_MS)
		}
	}
	this._doQuery(query, queryParams, msgHandler, done)
}

CassandraHelper.prototype._doQuery = function(query, queryParams, msgHandler, onDone, onError) {
	var lastOffset = null
	this.client.stream(
		query,
		queryParams,
		{
			prepare: true,
			autoPage: true
		}
	).on('readable', function() {
		//readable is emitted as soon a row is received and parsed
		var row;
		while (row = this.read()) {
			// Cassandra driver returns bigints as type Long. Convert them to Numbers for simplicity for now.
			// This only becomes a problem once they reach 2^52.
			var msg = new StreamrBinaryMessageWithKafkaMetadata(
				row.payload, // binary blob containing the StreamrBinaryMessage
				row.kafka_offset.toNumber(), // offset
				row.previous_offset != null ? row.previous_offset.toNumber() : undefined, // prevOffset
				undefined // kafkaPartition, not needed nor fetched, can be added if needed
			)
			lastOffset = row.kafka_offset.toNumber()
			msgHandler(msg.toArray())
		}
	})
	.on('end', function() {
		onDone(lastOffset) //stream ended, there aren't any more rows
	})
	.on('error', function(err) {
		//Something went wrong: err is a response error from Cassandra
		if (onError) {
			onError(err)
		} else {
			console.error(err)
		}
	})
}

CassandraHelper.prototype.getLast = function(stream, streamPartition, count, msgHandler, doneCallback, latestOffset) {
	var reversible = []
	// The results are reversed in memory, so hard limit number of results to 100k to avoid exhausting memory
	this.query(
		"SELECT kafka_offset, previous_offset, payload FROM stream_events WHERE stream = ? and stream_partition = ? ORDER BY kafka_offset DESC LIMIT ?",
		[stream, streamPartition, Math.min(count, 100000)],
		latestOffset,
		function(message) {
			reversible.push(message)
		},
		function() {
			// Need to report the messages in reverse (asc) order
			for (var i=reversible.length-1; i>= 0; i--) {
				msgHandler(reversible[i])
			}
			doneCallback(reversible)
		}
	)
}

CassandraHelper.prototype.getAll = function(stream, streamPartition, msgHandler, doneCallback, latestOffset) {
	this.query(
		"SELECT kafka_offset, previous_offset, payload FROM stream_events WHERE stream = ? AND stream_partition = ? ORDER BY kafka_offset ASC",
		[stream, streamPartition],
		latestOffset,
		msgHandler,
		doneCallback
	)
}

CassandraHelper.prototype.getFromOffset = function(stream, streamPartition, minOffset, msgHandler, doneCallback, latestOffset) {
	this.query(
		"SELECT kafka_offset, previous_offset, payload FROM stream_events WHERE stream = ? AND stream_partition = ? AND kafka_offset >= ? ORDER BY kafka_offset ASC",
		[stream, streamPartition, minOffset],
		latestOffset,
		msgHandler,
		doneCallback
	)
}

CassandraHelper.prototype.getOffsetRange = function(stream, streamPartition, minOffset, maxOffset, msgHandler, doneCallback, latestOffset) {
	this.query(
		"SELECT kafka_offset, previous_offset, payload FROM stream_events WHERE stream = ? AND stream_partition = ?  AND kafka_offset >= ? and kafka_offset <= ? ORDER BY kafka_offset ASC",
		[stream, streamPartition, minOffset, maxOffset],
		latestOffset,
		msgHandler,
		doneCallback
	)
}

CassandraHelper.prototype.getFromTimestamp = function(stream, streamPartition, minTimestamp, msgHandler, doneCallback, latestOffset) {
	var _this = this

	// get the starting kafka_offset and convert to getFromOffset query
	this.client.execute(
		"SELECT kafka_offset FROM stream_timestamps WHERE stream = ? AND stream_partition = ? AND ts >= ? ORDER BY ts ASC LIMIT 1",
		[stream, streamPartition, minTimestamp],
		{
			prepare: true,
			autoPage: true
		},
		function(err, result) {
			console.log(result, err)

			if (err) {
				doneCallback(err)
			}
			else if (result.rows) {
				_this.getFromOffset(stream, result.rows[0].kafka_offset, msgHandler, doneCallback, latestOffset)
			}
			else {
				doneCallback()
			}
		}
	)

}

CassandraHelper.prototype.getTimestampRange = function(stream, streamPartition, minTimestamp, maxTimestamp, msgHandler, doneCallback, latestOffset) {
	var _this = this

	var minOffset, maxOffset

	var tryDone = function() {
		if (minOffset !== undefined && maxOffset !== undefined) {
			_this.getOffsetRange(stream, streamPartition, minOffset, maxOffset, msgHandler, doneCallback, latestOffset)
		}
	}

	// get the starting and ending kafka_offset and convert to getOffsetRange query
	_this.client.execute(
		"SELECT kafka_offset FROM stream_timestamps WHERE stream = ? AND stream_partition = ? AND ts >= ? ORDER BY ts ASC LIMIT 1",
		[stream, streamPartition, minTimestamp],
		{
			prepare: true,
			autoPage: true
		},
		function(err, result) {
			if (err) {
				doneCallback(err)
			}
			else if (result.rows) {
				minOffset = result.rows[0].kafka_offset
				tryDone()
			}
			else {
				doneCallback()
			}
		}
	)
	// get the starting kafka_offset and convert to getFromOffset query
	_this.client.execute(
		"SELECT kafka_offset FROM stream_timestamps WHERE stream = ? AND stream_partition = ? AND ts <= ? ORDER BY ts DESC LIMIT 1",
		[stream, streamPartition, maxTimestamp],
		{
			prepare: true,
			autoPage: true
		},
		function(err, result) {
			if (err) {
				doneCallback(err)
			}
			else if (result.rows.length) {
				maxOffset = result.rows[0].kafka_offset
				tryDone()
			}
			// If this query doesn't find anything, the first one won't either,
			// se let's not call doneCallback() here to avoid calling it twice.
		}
	)
}

module.exports = CassandraHelper
