const cassandra = require('cassandra-driver')
const StreamrBinaryMessageWithKafkaMetadata = require('./protocol/StreamrBinaryMessageWithKafkaMetadata')
const debug = require('debug')('CassandraHelper')
const events = require('events')

const DEFAULT_OPTIONS = {
	maxRefetchRetries: 60,
	refetchInterval: 1000
}

// TODO: tests
function CassandraHelper(contactPoints, keyspace, options) {
	debug("Creating CassandraHelper: contactPoints: %o, keyspace: %s", contactPoints, keyspace)
	this.client = new cassandra.Client({
		contactPoints: contactPoints,
		keyspace: keyspace
	});
	this.options = Object.assign({}, DEFAULT_OPTIONS, options)
}

CassandraHelper.prototype.__proto__ = events.EventEmitter.prototype;

CassandraHelper.prototype.query = function(query, queryParams, lastKnownOffset, msgHandler, onDone, onMsgEnd, ctx) {
	const _this = this
	ctx = ctx || {
		streamId: queryParams[0],
		partition: queryParams[1],
		targetOffset: lastKnownOffset,
		currentOffset: null,
		msgHandler: msgHandler,
		onDone: onDone,
		onMsgEnd: onMsgEnd || function() {},
		refetchCount: 0
	}
	this._doQuery(query, queryParams, msgHandler, function (lastOffset) {
		_this._fetchMoreIfNeeded(lastOffset, ctx)
	})
}

CassandraHelper.prototype._fetchMoreIfNeeded = function(offsetFromLastCassandraRead, ctx) {
	ctx.onMsgEnd(offsetFromLastCassandraRead)
	if (offsetFromLastCassandraRead != null) {
		ctx.currentOffset = offsetFromLastCassandraRead
	}
	const statusString = "(" + ctx.currentOffset + "->" + ctx.targetOffset + ")"

	if (ctx.currentOffset === null) {
		debug("Cassandra no results for stream " + ctx.streamId + ", partition " + ctx.partition + " " + statusString)
		ctx.onDone(null)
	} else if (ctx.targetOffset == null || ctx.targetOffset <= ctx.currentOffset) {
		debug("Cassandra is up to date on stream " + ctx.streamId + ", partition " + ctx.partition + " " + statusString)
		ctx.onDone(ctx.currentOffset)
	} else if (ctx.refetchCount === this.options.maxRefetchRetries) {
		this.emit("maxRefetchAttemptsReached", ctx)
		ctx.onDone(ctx.currentOffset)
	} else {
		debug("Waiting for Cassandra to catch up on stream " + ctx.streamId + ", partition " + ctx.partition +
			" behind " + (ctx.targetOffset - ctx.currentOffset) + " messages " + statusString)

		ctx.refetchCount += 1
		const f = this.getOffsetRange.bind(this, ctx.streamId, ctx.partition, ctx.currentOffset + 1, ctx.targetOffset,
			ctx.msgHandler, ctx.onDone, ctx.targetOffset, ctx)
		setTimeout(f, this.options.refetchInterval)
	}

}


CassandraHelper.prototype._doQuery = function(query, queryParams, msgHandler, onEndOfMessages) {
	var largestOffset = null
	this.client.stream(query, queryParams, { prepare: true, autoPage: true }).on('readable', function() {
		// Invoked as soon a row is received
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
			var offset = row.kafka_offset.toNumber()
			if (largestOffset === null || offset > largestOffset) {
				largestOffset = offset
			}
			msgHandler(msg.toArray())
		}
	}).on('end', function() {
		onEndOfMessages(largestOffset)
	}).on('error', function(err) {
		console.error(err)
	})
}

CassandraHelper.prototype.getLast = function(stream, streamPartition, count, msgHandler, doneCallback, latestOffset) {
	var reverseMode = true
	var reversible = []

	// The results are reversed in memory, so hard limit number of results to 100k to avoid exhausting memory
	this.query(
		"SELECT kafka_offset, previous_offset, payload FROM stream_events WHERE stream = ? and stream_partition = ? ORDER BY kafka_offset DESC LIMIT ?",
		[stream, streamPartition, Math.min(count, 100000)],
		latestOffset,
		function(message) {
			if (reverseMode) {
				reversible.push(message)
			} else {
				msgHandler(message)
			}
		},
		doneCallback,
		function() {
			reverseMode = false
			// Need to report the messages in reverse (asc) order
			for (var i=reversible.length-1; i>= 0; i--) {
				msgHandler(reversible[i])
			}
			reversible = []
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

CassandraHelper.prototype.getOffsetRange = function(stream, streamPartition, minOffset, maxOffset, msgHandler, doneCallback, latestOffset, ctx) {
	this.query(
		"SELECT kafka_offset, previous_offset, payload FROM stream_events WHERE stream = ? AND stream_partition = ?  AND kafka_offset >= ? and kafka_offset <= ? ORDER BY kafka_offset ASC",
		[stream, streamPartition, minOffset, maxOffset],
		(latestOffset != null && latestOffset <= maxOffset ? latestOffset : null),
		msgHandler,
		doneCallback,
		null,
		ctx
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
