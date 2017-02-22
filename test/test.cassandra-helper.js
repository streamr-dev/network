var assert = require('assert')
const cassandra = require('cassandra-driver')
var CassandraHelper = require('../lib/cassandra-helper')
var StreamrBinaryMessage = require('../lib/protocol/StreamrBinaryMessage')
var StreamrBinaryMessageWithKafkaMetadata = require('../lib/protocol/StreamrBinaryMessageWithKafkaMetadata')


const CASSANDRA_HOST = '127.0.0.1'
const KEYSPACE = 'streamr_dev'

var CassandraDataInserter = function() {
	this.client = new cassandra.Client({
		contactPoints: [CASSANDRA_HOST],
		keyspace: KEYSPACE
	})
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


describe('CassandraHelper', function() {
	var cassandraHelper
	var messagesReceived
	var msgHandler
	var cassandraDataInserter

	beforeEach(function() {
		cassandraHelper = new CassandraHelper([CASSANDRA_HOST], KEYSPACE)
		messagesReceived = []
		msgHandler = messagesReceived.push.bind(messagesReceived)
		cassandraDataInserter = new CassandraDataInserter()
		return cassandraDataInserter.bulkInsert(50)
	})

	afterEach(function() {
		return cassandraDataInserter.clearAndClose()
	})

	describe("getLast", function() {
		var expectedDataForFirstQuery

		beforeEach(function() {
			expectedDataForFirstQuery = [
				[28, "fake-stream-1", 0, 1490183160000, 10, 230, 225, 27, { "key": "msg-46" }],
				[28, "fake-stream-1", 0, 1490183220000, 10, 235, 230, 27, { "key": "msg-47" }],
				[28, "fake-stream-1", 0, 1490183280000, 10, 240, 235, 27, { "key": "msg-48" }],
				[28, "fake-stream-1", 0, 1490183340000, 10, 245, 240, 27, { "key": "msg-49" }],
				[28, "fake-stream-1", 0, 1490183400000, 10, 250, 245, 27, { "key": "msg-50" }]
			]
		})

		it("produces correct messages when lastKnownOffset === undefined", function(done) {
			const onDone = function() {
				assert.deepEqual(messagesReceived, expectedDataForFirstQuery)
				done()
			}
			cassandraHelper.getLast("fake-stream-1", 0, 5, msgHandler, onDone)
		})

		it("produces correct messages when lastKnownOffset < cassandraLastOffset", function(done) {
			const onDone = function() {
				assert.deepEqual(messagesReceived, expectedDataForFirstQuery)
				done()
			}
			cassandraHelper.getLast("fake-stream-1", 0, 5, msgHandler, onDone, 200)
		})

		it("produces correct messages when lastKnownOffset == cassandraLastOffset", function(done) {
			const onDone = function() {
				assert.deepEqual(messagesReceived, expectedDataForFirstQuery)
				done()
			}
			cassandraHelper.getLast("fake-stream-1", 0, 5, msgHandler, onDone, 230)
		})

		it("produces correct messages when lastKnownOffset > cassandraLastOffset", function(done) {
			var expectedDataForSecondQuery = [
				[28, "fake-stream-1", 0, 1490183460000, 10, 255, 250, 27, { "key": "msg-51" }],
				[28, "fake-stream-1", 0, 1490183520000, 10, 260, 255, 27, { "key": "msg-52" }]

			]
			var dataPushed = false

			const onDone = function() {
				assert.equal(dataPushed, true)
				assert.deepEqual(messagesReceived, expectedDataForFirstQuery.concat(expectedDataForSecondQuery))
				done()
			}
			cassandraHelper.getLast("fake-stream-1", 0, 5, msgHandler, onDone, 260)

			setTimeout(function() {
				cassandraDataInserter.bulkInsert(2).then(function() {
					dataPushed = true
				}).catch(function(e) {
					console.error(e)
				})
			}, 200)
		})
	})
})