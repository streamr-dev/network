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
	var expectedMessages
	var cassandraHelper
	var messagesReceived
	var msgHandler
	var cassandraDataInserter

	beforeEach(function() {
		expectedMessages = [
			[28, "fake-stream-1", 0, 1490180460000, 10, 5, -1,  27, { "key": "msg-1" }],
			[28, "fake-stream-1", 0, 1490180520000, 10, 10, 5,  27, { "key": "msg-2" }],
			[28, "fake-stream-1", 0, 1490180580000, 10, 15, 10,  27, { "key": "msg-3" }],
			[28, "fake-stream-1", 0, 1490180640000, 10, 20, 15,  27, { "key": "msg-4" }],
			[28, "fake-stream-1", 0, 1490180700000, 10, 25, 20,  27, { "key": "msg-5" }],
			[28, "fake-stream-1", 0, 1490180760000, 10, 30, 25,  27, { "key": "msg-6" }],
			[28, "fake-stream-1", 0, 1490180820000, 10, 35, 30,  27, { "key": "msg-7" }],
			[28, "fake-stream-1", 0, 1490180880000, 10, 40, 35,  27, { "key": "msg-8" }],
			[28, "fake-stream-1", 0, 1490180940000, 10, 45, 40,  27, { "key": "msg-9" }],
			[28, "fake-stream-1", 0, 1490181000000, 10, 50, 45,  27, { "key": "msg-10" }],
			[28, "fake-stream-1", 0, 1490181060000, 10, 55, 50,  27, { "key": "msg-11" }],
			[28, "fake-stream-1", 0, 1490181120000, 10, 60, 55,  27, { "key": "msg-12" }],
			[28, "fake-stream-1", 0, 1490181180000, 10, 65, 60,  27, { "key": "msg-13" }],
			[28, "fake-stream-1", 0, 1490181240000, 10, 70, 65,  27, { "key": "msg-14" }],
			[28, "fake-stream-1", 0, 1490181300000, 10, 75, 70,  27, { "key": "msg-15" }],
			[28, "fake-stream-1", 0, 1490181360000, 10, 80, 75,  27, { "key": "msg-16" }],
			[28, "fake-stream-1", 0, 1490181420000, 10, 85, 80,  27, { "key": "msg-17" }],
			[28, "fake-stream-1", 0, 1490181480000, 10, 90, 85,  27, { "key": "msg-18" }],
			[28, "fake-stream-1", 0, 1490181540000, 10, 95, 90,  27, { "key": "msg-19" }],
			[28, "fake-stream-1", 0, 1490181600000, 10, 100, 95, 27, { "key": "msg-20" }]
		]

		cassandraHelper = new CassandraHelper([CASSANDRA_HOST], KEYSPACE, {
			maxRefetchRetries: 2,
			refetchInterval: 400
		})
		messagesReceived = []
		msgHandler = messagesReceived.push.bind(messagesReceived)
		cassandraDataInserter = new CassandraDataInserter()
		return cassandraDataInserter.bulkInsert(20)
	})

	afterEach(function() {
		return cassandraDataInserter.clearAndClose()
	})


	function doneAssertion(expectedLastOffsetSent, expectedMessages, done) {
		return function(lastOffsetSent) {
			assert.equal(lastOffsetSent, expectedLastOffsetSent)
			assert.deepEqual(messagesReceived, expectedMessages)
			done()
		}
	}

	describe("getLast", function() {
		beforeEach(function() {
			expectedMessages = expectedMessages.slice(15, 20)
		})

		it("produces correct messages when lastKnownOffset === undefined", function(done) {
			cassandraHelper.getLast("fake-stream-1", 0, 5, msgHandler, doneAssertion(100, expectedMessages, done))
		})

		it("produces correct messages when no messages in cassandra and lastKnownOffset === undefined", function(done) {
			cassandraDataInserter.clearAndClose()
			cassandraHelper.getLast("fake-stream-1", 0, 5, msgHandler, doneAssertion(null, [], done))
		})

		it("produces correct messages when lastKnownOffset < cassandraLastOffset", function(done) {
			cassandraHelper.getLast("fake-stream-1", 0, 5, msgHandler, doneAssertion(100, expectedMessages, done), 90)
		})

		it("produces correct messages when lastKnownOffset == cassandraLastOffset", function(done) {
			cassandraHelper.getLast("fake-stream-1", 0, 5, msgHandler, doneAssertion(100, expectedMessages, done), 100)
		})

		it("produces correct messages when lastKnownOffset > cassandraLastOffset", function(done) {
			 expectedMessages = expectedMessages.concat([
				[28, "fake-stream-1", 0, 1490181660000, 10, 105, 100, 27, { "key": "msg-21" }],
				[28, "fake-stream-1", 0, 1490181720000, 10, 110, 105, 27, { "key": "msg-22" }]
			])
			cassandraHelper.getLast("fake-stream-1", 0, 5, msgHandler, doneAssertion(110, expectedMessages, done), 110)
			cassandraDataInserter.timedBulkInsert(2, 250)
		})

		it("eventually gives up if lastKnownOffset never appears", function(done) {
			cassandraHelper.getLast("fake-stream-1", 0, 5, msgHandler, doneAssertion(100, expectedMessages, done), 110)
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

	describe("getAll", function () {
		it("produces correct messages when lastKnownOffset === undefined", function(done) {
			cassandraHelper.getAll("fake-stream-1", 0, msgHandler, doneAssertion(100, expectedMessages, done))
		})

		it("produces correct messages when no messages in cassandra and lastKnownOffset === undefined", function(done) {
			cassandraDataInserter.clearAndClose()
			cassandraHelper.getAll("fake-stream-1", 0, msgHandler, doneAssertion(null, [], done))
		})

		it("produces correct messages when lastKnownOffset < cassandraLastOffset", function(done) {
			cassandraHelper.getAll("fake-stream-1", 0, msgHandler, doneAssertion(100, expectedMessages, done), 90)
		})

		it("produces correct messages when lastKnownOffset == cassandraLastOffset", function(done) {
			cassandraHelper.getAll("fake-stream-1", 0, msgHandler, doneAssertion(100, expectedMessages, done), 100)
		})

		it("produces correct messages when lastKnownOffset > cassandraLastOffset", function(done) {
			expectedMessages = expectedMessages.concat([
				[28, "fake-stream-1", 0, 1490181660000, 10, 105, 100, 27, { "key": "msg-21" }],
				[28, "fake-stream-1", 0, 1490181720000, 10, 110, 105, 27, { "key": "msg-22" }]
			])
			cassandraHelper.getAll("fake-stream-1", 0, msgHandler, doneAssertion(110, expectedMessages, done), 110)
			cassandraDataInserter.timedBulkInsert(2, 250)
		})

		it("eventually gives up if lastKnownOffset never appears", function(done) {
			cassandraHelper.getAll("fake-stream-1", 0, msgHandler, doneAssertion(100, expectedMessages, done), 110)
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
			cassandraHelper.getAll("fake-stream-1", 0, msgHandler, function(){}, 110)
		})
	})

	describe("getFromOffset", function () {
		beforeEach(function() {
			expectedMessages = expectedMessages.slice(10, 20)
		})

		it("produces correct messages when lastKnownOffset === undefined", function(done) {
			cassandraHelper.getFromOffset("fake-stream-1", 0, 53, msgHandler, doneAssertion(100, expectedMessages, done))
		})

		it("produces correct messages when no messages in cassandra and lastKnownOffset === undefined", function(done) {
			cassandraDataInserter.clearAndClose()
			cassandraHelper.getFromOffset("fake-stream-1", 0, 53, msgHandler, doneAssertion(null, [], done))
		})

		it("produces correct messages when lastKnownOffset < cassandraLastOffset", function(done) {
			cassandraHelper.getFromOffset("fake-stream-1", 0, 53, msgHandler, doneAssertion(100, expectedMessages, done), 90)
		})

		it("produces correct messages when lastKnownOffset == cassandraLastOffset", function(done) {
			cassandraHelper.getFromOffset("fake-stream-1", 0, 53, msgHandler, doneAssertion(100, expectedMessages, done), 100)
		})

		it("produces correct messages when lastKnownOffset > cassandraLastOffset", function(done) {
			expectedMessages = expectedMessages.concat([
				[28, "fake-stream-1", 0, 1490181660000, 10, 105, 100, 27, { "key": "msg-21" }],
				[28, "fake-stream-1", 0, 1490181720000, 10, 110, 105, 27, { "key": "msg-22" }]
			])
			cassandraHelper.getFromOffset("fake-stream-1", 0, 53, msgHandler, doneAssertion(110, expectedMessages, done), 110)
			cassandraDataInserter.timedBulkInsert(2, 250)
		})

		it("eventually gives up if lastKnownOffset never appears", function(done) {
			cassandraHelper.getFromOffset("fake-stream-1", 0, 53, msgHandler, doneAssertion(100, expectedMessages, done), 110)
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
			cassandraHelper.getFromOffset("fake-stream-1", 0, 53, msgHandler, function(){}, 110)
		})
	})
})