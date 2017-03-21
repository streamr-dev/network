const cassandra = require('cassandra-driver')
const StreamrBinaryMessageWithKafkaMetadata = require('./protocol/StreamrBinaryMessageWithKafkaMetadata')
const debug = require('debug')('CassandraHelper')
const events = require('events')

const DEFAULT_OPTIONS = {
	maxRefetchRetries: 60,
	refetchInterval: 1000
}

function CassandraHelper(contactPoints, keyspace, options) {
	debug("Creating CassandraHelper: contactPoints: %o, keyspace: %s", contactPoints, keyspace)
	this.client = new cassandra.Client({
		contactPoints: contactPoints,
		keyspace: keyspace
	})
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

	if (ctx.targetOffset == null || ctx.targetOffset <= ctx.currentOffset) {
		debug("Cassandra is up to date on stream " + ctx.streamId + ", partition " + ctx.partition + " " + statusString)
		ctx.onDone(ctx.currentOffset)
	} else if (ctx.refetchCount === this.options.maxRefetchRetries) {
		this.emit("maxRefetchAttemptsReached", ctx)
		ctx.onDone(ctx.currentOffset)
	} else {
		debug("Waiting for Cassandra to catch up on stream " + ctx.streamId + ", partition " + ctx.partition + " " + statusString)

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
		onEndOfMessages(largestOffset, err)
	})
}

CassandraHelper.prototype.getLast = function(stream, streamPartition, count, msgHandler, doneCallback, latestKnownOffset) {
	var reverseMode = true
	var reversible = []

	// The results are reversed in memory, so hard limit number of results to 100k to avoid exhausting memory
	this.query(
		"SELECT kafka_offset, previous_offset, payload FROM stream_events WHERE stream = ? and stream_partition = ? ORDER BY kafka_offset DESC LIMIT ?",
		[stream, streamPartition, Math.min(count, 100000)],
		latestKnownOffset,
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

CassandraHelper.prototype.getAll = function(stream, streamPartition, msgHandler, doneCallback, latestKnownOffset) {
	this.query(
		"SELECT kafka_offset, previous_offset, payload FROM stream_events WHERE stream = ? AND stream_partition = ? ORDER BY kafka_offset ASC",
		[stream, streamPartition],
		latestKnownOffset,
		msgHandler,
		doneCallback
	)
}

CassandraHelper.prototype.getFromOffset = function(stream, streamPartition, minOffset, msgHandler, doneCallback, latestKnownOffset) {
	this.query(
		"SELECT kafka_offset, previous_offset, payload FROM stream_events WHERE stream = ? AND stream_partition = ? AND kafka_offset >= ? ORDER BY kafka_offset ASC",
		[stream, streamPartition, minOffset],
		latestKnownOffset,
		msgHandler,
		doneCallback
	)
}

CassandraHelper.prototype.getOffsetRange = function(stream, streamPartition, minOffset, maxOffset, msgHandler, doneCallback, latestKnownOffset, ctx) {
	this.query(
		"SELECT kafka_offset, previous_offset, payload FROM stream_events WHERE stream = ? AND stream_partition = ?  AND kafka_offset >= ? and kafka_offset <= ? ORDER BY kafka_offset ASC",
		[stream, streamPartition, minOffset, maxOffset],
		(latestKnownOffset != null && latestKnownOffset <= maxOffset ? latestKnownOffset : null),
		msgHandler,
		doneCallback,
		null,
		ctx
	)
}

CassandraHelper.prototype.getFromTimestamp = function(stream, streamPartition, minTimestamp, msgHandler, doneCallback, latestKnownOffset) {
	var _this = this

	this._getFirstOffsetAfter(stream, streamPartition, minTimestamp).then(function(offset) {
		if (offset === null) {
			doneCallback(null)
		} else {
			_this.getFromOffset(stream, streamPartition, offset, msgHandler, doneCallback, latestKnownOffset)
		}
	}).catch(function(error) {
		console.error(error)
		doneCallback(error)
	})
}

CassandraHelper.prototype.getTimestampRange = function(stream, streamPartition, minTimestamp, maxTimestamp, msgHandler, doneCallback) {
	var _this = this

	Promise.all([
		this._getFirstOffsetAfter(stream, streamPartition, minTimestamp),
		this._getLastOffsetBefore(stream, streamPartition, maxTimestamp)
	]).then(function(result) {
		const minOffset = result[0]
		const maxOffset = result[1]
		if (minOffset == null || maxOffset == null) {
			doneCallback()
		} else {
			_this.getOffsetRange(stream, streamPartition, minOffset, maxOffset, msgHandler, doneCallback)
		}
	})
}

CassandraHelper.prototype._getFirstOffsetAfter = function(stream, streamPartition, minTimestamp) {
	return this.client.execute("SELECT kafka_offset FROM stream_timestamps WHERE stream = ? AND stream_partition = ? AND ts >= ? ORDER BY ts ASC LIMIT 1",
		[stream, streamPartition, minTimestamp],
		{ prepare: true, autopage: true }
	).then(function(result) {
		return new Promise(function(resolve, reject) {
			resolve(result.rows.length > 0 ? result.rows[0].kafka_offset.toNumber() : null)
		})
	})
}

CassandraHelper.prototype._getLastOffsetBefore = function(stream, streamPartition, maxTimestamp) {
	return this.client.execute("SELECT kafka_offset FROM stream_timestamps WHERE stream = ? AND stream_partition = ? AND ts <= ? ORDER BY ts DESC LIMIT 1",
		[stream, streamPartition, maxTimestamp],
		{ prepare: true, autopage: true }
	).then(function(result) {
		return new Promise(function(resolve, reject) {
			resolve(result.rows.length > 0 ? result.rows[0].kafka_offset.toNumber() : null)
		})
	})
}

module.exports = CassandraHelper