const cassandra = require('cassandra-driver')
const StreamrBinaryMessage = require('../../lib/protocol/StreamrBinaryMessage')

/**
 * Used to populate Cassandra with pre-defined messages for testing purposes.
*/
const CassandraDataInserter = function(host, keyspace) {
	this.client = new cassandra.Client({ contactPoints: [host], keyspace: keyspace })
	this.index = 1
	this.offset = 5
	this.previousOffset = -1
}

CassandraDataInserter.prototype.clearAndClose = function() {
	return Promise.all([
		this.client.execute("DELETE FROM stream_timestamps WHERE stream = 'fake-stream-1' AND stream_partition = 0"),
		this.client.execute("DELETE FROM stream_events WHERE stream = 'fake-stream-1' AND stream_partition = 0")
	]).then(Promise.resolve(this.client.shutdown.bind(this.client)))
}

CassandraDataInserter.prototype.timedBulkInsert = function(n, timeoutInMs) {
	const _this = this
	setTimeout(function() {
		_this.bulkInsert(n).then(function() {
			console.info("Pushed " + n + " additional events")
		}).catch(function(e) {
			console.error(e)
		})
	}, timeoutInMs)
}

CassandraDataInserter.prototype.bulkInsert = function(n) {
	const promises = []
	for (var i=0; i < n; ++i) {
		promises.push.apply(promises, this.insertData())
	}
	return Promise.all(promises)
}

CassandraDataInserter.prototype.insertData = function() {
	var streamId = "fake-stream-1"
	var partition = 0
	var timestamp = new Date(2017, 2, 22, 13, this.index, 0)
	var ttl = 10
	var contentType = StreamrBinaryMessage.CONTENT_TYPE_JSON
	var content = { key: "msg-" + this.index }
	var msg = new StreamrBinaryMessage(streamId, partition, timestamp, ttl, contentType, content)

	var promises = []
	promises.push(this.client.execute("INSERT INTO stream_events" +
		"(stream, stream_partition, kafka_partition, kafka_offset, previous_offset, ts, payload)" +
		" VALUES (?, ?, ?, ?, ?, ?, ?) USING TTL ?",
		[streamId, partition, 0, this.offset, this.previousOffset, timestamp, msg.toBytes(), ttl], { prepare: true }))
	promises.push(this.client.execute("INSERT INTO stream_timestamps" +
		" (stream, stream_partition, kafka_offset, ts)" +
		" VALUES (?, ?, ?, ?) USING TTL ?", [streamId, partition, this.offset, timestamp, ttl], { prepare: true }))

	this.previousOffset = this.offset
	this.offset += 5
	this.index += 1

	return promises
}

module.exports = CassandraDataInserter