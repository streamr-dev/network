const cassandra = require('cassandra-driver')
const protocol = require('./protocol')
const MessageWithKafkaMetadata = require('./message-with-kafka-metadata')
const debug = require('debug')('CassandraHelper')

// TODO: tests
function CassandraHelper(contactPoints, keyspace) {
	debug("Creating CassandraHelper: contactPoints: %o, keyspace: %s", contactPoints, keyspace)
	this.client = new cassandra.Client({
		contactPoints: contactPoints,
		keyspace: keyspace
	});
}

CassandraHelper.prototype.query = function(query, queryParams, msgHandler, doneCallback) {
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
			var msg = protocol.decodeMessage(row.payload)
			var kafkaMsg = new MessageWithKafkaMetadata(row.kafka_offset.toNumber(), row.previous_offset != null ? row.previous_offset.toNumber() : undefined, msg)
			msgHandler(kafkaMsg)
		}
	})
	.on('end', function() {
		//stream ended, there aren't any more rows
		doneCallback()
	})
	.on('error', function(err) {
		//Something went wrong: err is a response error from Cassandra
		doneCallback(err)
	})
}

CassandraHelper.prototype.getLast = function(stream, streamPartition, count, msgHandler, doneCallback) {
	var reversible = []
	// The results are reversed in memory, so hard limit number of results to 100k to avoid exhausting memory
	this.query(
		"SELECT kafka_offset, previous_offset, payload FROM stream_events WHERE stream = ? and stream_partition = ? ORDER BY kafka_offset DESC LIMIT ?",
		[stream, streamPartition, Math.min(count, 100000)],
		function(message) {
			reversible.push(message)
		},
		function(err) {
			if (err) {
				doneCallback(err)
			}
			else {
				// Need to report the messages in reverse (asc) order
				for (var i=reversible.length-1; i>= 0; i--) {
					msgHandler(reversible[i])
				}
				doneCallback()
			}
		}
	)
}

CassandraHelper.prototype.getAll = function(stream, streamPartition, msgHandler, doneCallback) {
	this.query(
		"SELECT kafka_offset, previous_offset, payload FROM stream_events WHERE stream = ? AND stream_partition = ? ORDER BY kafka_offset ASC",
		[stream, streamPartition],
		msgHandler,
		doneCallback
	)
}

CassandraHelper.prototype.getFromOffset = function(stream, streamPartition, minOffset, msgHandler, doneCallback) {
	this.query(
		"SELECT kafka_offset, previous_offset, payload FROM stream_events WHERE stream = ? AND stream_partition = ? AND kafka_offset >= ? ORDER BY kafka_offset ASC",
		[stream, streamPartition, minOffset],
		msgHandler,
		doneCallback
	)
}

CassandraHelper.prototype.getOffsetRange = function(stream, streamPartition, minOffset, maxOffset, msgHandler, doneCallback) {
	this.query(
		"SELECT kafka_offset, previous_offset, payload FROM stream_events WHERE stream = ? AND stream_partition = ?  AND kafka_offset >= ? and kafka_offset <= ? ORDER BY kafka_offset ASC",
		[stream, streamPartition, minOffset, maxOffset],
		msgHandler,
		doneCallback
	)
}

CassandraHelper.prototype.getFromTimestamp = function(stream, streamPartition, minTimestamp, msgHandler, doneCallback) {
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
				_this.getFromOffset(stream, result.rows[0].kafka_offset, msgHandler, doneCallback)
			}
			else {
				doneCallback()
			}
		}
	)

}

CassandraHelper.prototype.getTimestampRange = function(stream, streamPartition, minTimestamp, maxTimestamp, msgHandler, doneCallback) {
	var _this = this

	var minOffset, maxOffset

	var tryDone = function() {
		if (minOffset !== undefined && maxOffset !== undefined) {
			_this.getOffsetRange(stream, streamPartition, minOffset, maxOffset, msgHandler, doneCallback)
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
