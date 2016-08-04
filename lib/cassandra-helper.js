const cassandra = require('cassandra-driver')
const decoder = require('./decoder')
const debug = require('debug')('CassandraHelper')

function CassandraHelper(contactPoints, keyspace) {
	debug("Creating CassandraHelper: contactPoints: %o, keyspace: %s", contactPoints, keyspace)
	this.client = new cassandra.Client({
		contactPoints: contactPoints,
		keyspace: keyspace
	});
}

CassandraHelper.prototype.query = function(query, queryParams, msgHandler, doneCallback) {
	this.client.execute(
		query,
		queryParams,
		{
			prepare: true,
			autoPage: true
		},
		// Msg handler
		function(n, row) {
			msgHandler(decoder.decode(row.payload))
		},
		// Done callback
		function(err) {
			doneCallback(err)
		});
}

CassandraHelper.prototype.getLast = function(stream, count, msgHandler, doneCallback) {
	this.query(
		"SELECT payload FROM stream_events WHERE stream = ? ORDER BY kafka_offset DESC LIMIT ?",
		[stream, count],
		msgHandler,
		doneCallback
	)
}

CassandraHelper.prototype.getFromOffset = function(stream, minOffset, msgHandler, doneCallback) {
	this.query(
		"SELECT payload FROM stream_events WHERE stream = ? AND kafka_offset >= ?",
		[stream, minOffset],
		msgHandler,
		doneCallback
	)
}

CassandraHelper.prototype.getOffsetRange = function(stream, minOffset, maxOffset, msgHandler, doneCallback) {
	this.query(
		"SELECT payload FROM stream_events WHERE stream = ? AND kafka_offset >= ? and kafka_offset <= ?",
		[stream, minOffset, maxOffset],
		msgHandler,
		doneCallback
	)
}

CassandraHelper.prototype.getTimestampRange = function(stream, minTimestamp, maxTimestamp, msgHandler, doneCallback) {
	this.query(
		"SELECT payload FROM stream_events WHERE stream = ? AND ts >= ? and ts <= ?",
		[stream, minOffset, maxOffset],
		msgHandler,
		doneCallback
	)
}

module.exports = CassandraHelper
