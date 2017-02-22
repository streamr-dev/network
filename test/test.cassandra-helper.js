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


describe('CassandraHelper', function() {
	var cassandraHelper
	var messagesReceived
	var msgHandler
	var cassandraDataInserter

	beforeEach(function() {
		cassandraHelper = new CassandraHelper([CASSANDRA_HOST], KEYSPACE, {
			maxRefetchRetries: 2,
			refetchInterval: 200
		})
		messagesReceived = []
		msgHandler = messagesReceived.push.bind(messagesReceived)
		cassandraDataInserter = new CassandraDataInserter()
		return cassandraDataInserter.bulkInsert(20)
	})

	afterEach(function() {
		return cassandraDataInserter.clearAndClose()
	})

	describe("getLast", function() {
		var expectedDataForFirstQuery

		beforeEach(function() {
			expectedDataForFirstQuery = [
				[28, "fake-stream-1", 0, 1490181360000, 10, 80, 75,  27, { "key": "msg-16" }],
				[28, "fake-stream-1", 0, 1490181420000, 10, 85, 80,  27, { "key": "msg-17" }],
				[28, "fake-stream-1", 0, 1490181480000, 10, 90, 85,  27, { "key": "msg-18" }],
				[28, "fake-stream-1", 0, 1490181540000, 10, 95, 90,  27, { "key": "msg-19" }],
				[28, "fake-stream-1", 0, 1490181600000, 10, 100, 95, 27, { "key": "msg-20" }]
			]
		})

		it("produces correct messages when lastKnownOffset === undefined", function(done) {
			const onDone = function(lastOffsetSent) {
				assert.equal(lastOffsetSent, 100)
				assert.deepEqual(messagesReceived, expectedDataForFirstQuery)
				done()
			}
			cassandraHelper.getLast("fake-stream-1", 0, 5, msgHandler, onDone)
		})

		it("produces correct messages when lastKnownOffset < cassandraLastOffset", function(done) {
			const onDone = function(lastOffsetSent) {
				assert.equal(lastOffsetSent, 100)
				assert.deepEqual(messagesReceived, expectedDataForFirstQuery)
				done()
			}
			cassandraHelper.getLast("fake-stream-1", 0, 5, msgHandler, onDone, 90)
		})

		it("produces correct messages when lastKnownOffset == cassandraLastOffset", function(done) {
			const onDone = function(lastOffsetSent) {
				assert.equal(lastOffsetSent, 100)
				assert.deepEqual(messagesReceived, expectedDataForFirstQuery)
				done()
			}
			cassandraHelper.getLast("fake-stream-1", 0, 5, msgHandler, onDone, 100)
		})

		it("produces correct messages when lastKnownOffset > cassandraLastOffset", function(done) {
			const expectedDataForSecondQuery = [
				[28, "fake-stream-1", 0, 1490181660000, 10, 105, 100, 27, { "key": "msg-21" }],
				[28, "fake-stream-1", 0, 1490181720000, 10, 110, 105, 27, { "key": "msg-22" }]
			]
			const expectedMessages = expectedDataForFirstQuery.concat(expectedDataForSecondQuery)

			const onDone = function(lastOffsetSent) {
				assert.equal(lastOffsetSent, 110)
				assert.deepEqual(messagesReceived, expectedMessages)
				done()
			}
			cassandraHelper.getLast("fake-stream-1", 0, 5, msgHandler, onDone, 110)
			cassandraDataInserter.timedBulkInsert(2, 250)
		})

		it("eventually gives up if lastKnownOffset never appears", function(done) {
			const onDone = function(lastOffsetSent) {
				assert.equal(lastOffsetSent, 100)
				assert.deepEqual(messagesReceived, expectedDataForFirstQuery)
				done()
			}
			cassandraHelper.getLast("fake-stream-1", 0, 5, msgHandler, onDone, 110)
		})

		it("emits error if lastKnownOffset never appears", function(done) {
			cassandraHelper.on("maxRefetchAttemptsReached", function(data) {
				assert.deepEqual(Object.keys(data), [
					"streamId", "partition", "targetOffset", "currentOffset",
					"msgHandler", "onDone", "onMsgEnd", "refetchCount"
				])

				assert.equal(data.streamId, "fake-stream-1")
				assert.equal(data.partition, 0)
				assert.equal(data.targetOffset, 110)
				assert.equal(data.currentOffset, 100)
				assert.equal(data.refetchCount, 2)

				done()
			})
			cassandraHelper.getLast("fake-stream-1", 0, 5, msgHandler, function(){}, 110)
		})
	})
})